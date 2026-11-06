import {
  parseMarketState, parseMarketCandlesResponse, parseMarketHistoryResponse, parseMarketPositionResponse,
  type MarketState, type MarketCandle, type MarketReceipt, type MarketPositionRequest,
} from '../../shared/market-v1.ts'
import { boundedMarketCache, browserMarketStorage, emptyMarketCache, readMarketCache, writeMarketCache, writeMarketPending, type MarketCache, type MarketStorage } from './market-cache.ts'

const BASE = '/liangxiang/api/market'
const TIMEOUT_MS = 6_000
export interface MarketResponse { body: unknown, scope: string }
export interface MarketTransport {
  request(path: string, body?: MarketPositionRequest): Promise<MarketResponse>
  events(onState: (body: unknown, scope: string) => void, onError: () => void): { close(): void }
  requestId(): string
  dispose(): void
}
export interface MarketView {
  state: MarketState | null
  status: 'loading' | 'live' | 'offline' | 'unsupported'
  candles: MarketCandle[]
  receipts: MarketReceipt[]
  nextCursor: string | null
  pending: MarketPositionRequest | null
  sending: boolean
  historyLoading: boolean
  error: string | null
  chartError: string | null
  scope: string
}
export interface MarketSession {
  getSnapshot(): MarketView
  subscribe(listener: () => void): () => void
  start(): Promise<void>
  submit(intent: Omit<MarketPositionRequest, 'request_id'>): Promise<void>
  retryPending(): Promise<void>
  loadHistory(more?: boolean): Promise<void>
  dispose(): void
}

class MarketHttpError extends Error {
  constructor(readonly status: number) { super(status === 404 ? '当前 Host 暂不支持香火交易，请安装新版插件后再试。' : status === 409 ? '仓位状态已变化，正在重新核对。' : '暂时无法连接社区，请稍后重试。') }
}

export function browserMarketTransport(): MarketTransport {
  const controllers = new Set<AbortController>()
  let disposed = false
  return {
    async request(path, body) {
      if (disposed) throw new Error('交易窗口已关闭')
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      controllers.add(controller)
      try {
        const response = await fetch(`${BASE}${path}`, { method: body ? 'POST' : 'GET', signal: controller.signal,
          ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) })
        if (!response.ok && response.status !== 409) throw new MarketHttpError(response.status)
        return { body: await response.json() as unknown, scope: response.headers.get('x-liangxiang-cache-scope') ?? '' }
      } finally { clearTimeout(timer); controllers.delete(controller) }
    },
    events(onState, onError) {
      const source = new EventSource(`${BASE}/events`)
      source.onmessage = event => {
        try {
          const body: unknown = JSON.parse(String(event.data))
          const scope = body && typeof body === 'object' && 'cache_scope' in body && typeof body.cache_scope === 'string' ? body.cache_scope : ''
          onState(body, scope)
        } catch { onError() }
      }
      source.onerror = onError
      return { close: () => source.close() }
    },
    requestId: () => crypto.randomUUID(),
    dispose() { disposed = true; for (const controller of controllers) controller.abort(); controllers.clear() },
  }
}

export function createMarketSession(transport: MarketTransport = browserMarketTransport(), storage: MarketStorage | null = browserMarketStorage()): MarketSession {
  let view: MarketView = { state: null, status: 'loading', candles: [], receipts: [], nextCursor: null, pending: null, sending: false, historyLoading: false, error: null, chartError: null, scope: '' }
  let cache: MarketCache = emptyMarketCache('')
  let disposed = false, source: { close(): void } | null = null, chartKey = '', chartLoading = false, lastCacheSave = 0
  const listeners = new Set<() => void>()
  const update = (patch: Partial<MarketView>): void => {
    if (disposed) return
    view = { ...view, ...patch }
    for (const listener of listeners) listener()
  }
  const save = (immediate = true): void => {
    if (!immediate && Date.now() - lastCacheSave < 15_000) return
    cache = boundedMarketCache(cache)
    writeMarketCache(storage, cache); lastCacheSave = Date.now()
  }
  const withCandle = (candles: MarketCandle[], candle: MarketCandle): MarketCandle[] => [...candles.filter(c => c.at !== candle.at), candle].sort((a, b) => a.at - b.at).slice(-288)
  const adoptScope = (scope: string): void => {
    if (!scope || scope === view.scope) return
    cache = readMarketCache(storage, scope)
    update({ scope, receipts: cache.receipts, pending: cache.pending, candles: [], nextCursor: null })
    chartKey = ''
  }
  const loadCandles = async (): Promise<void> => {
    const market = view.state?.market
    if (!market || chartLoading) return
    chartLoading = true
    try {
      const sequenceAtRequest = view.state?.current_point?.sequence
      const query = new URLSearchParams({ business_date: market.business_date, case_id: market.case_id, limit: '288' })
      const response = await transport.request(`/candles?${query}`)
      const data = parseMarketCandlesResponse(response.body)
      if (disposed || view.state?.market?.case_id !== data.case_id) return
      const live = view.state.current_candle
      const candles = live && view.state.current_point?.sequence !== sequenceAtRequest ? withCandle(data.candles, live) : data.candles
      cache.candles = [{ case_id: data.case_id, business_date: data.business_date, candles }, ...cache.candles.filter(day => day.case_id !== data.case_id)]
      save()
      update({ candles, chartError: null })
    } catch { update({ chartError: '行情暂未更新，官方参考点仍有效。' }) }
    finally { chartLoading = false }
  }
  const adopt = (state: MarketState, scope: string): void => {
    if (disposed) return
    const identityChanged = scope !== '' && view.scope !== '' && scope !== view.scope
    if (!identityChanged && view.state && state.server_time < view.state.server_time) return
    adoptScope(scope)
    const old = view.state
    const market = state.market
    let candles = old?.market?.case_id !== market?.case_id ? [] : view.candles
    if (state.current_candle) candles = withCandle(candles, state.current_candle)
    update({ state, candles, status: 'live', error: view.pending ? '存在一笔未确认仓位，请核对原请求后再调整。' : null })
    if (market) {
      if (state.current_candle) {
        cache.candles = [{ case_id: market.case_id, business_date: market.business_date, candles }, ...cache.candles.filter(day => day.case_id !== market.case_id)]
        save(false)
      }
      const key = `${market.id}:${Math.floor(state.server_time / 300_000)}:${market.status}`
      if (chartKey !== key) {
        const cached = cache.candles.find(day => day.case_id === market.case_id)
        if (view.candles.length === 0 && cached) update({ candles: cached.candles })
        chartKey = key
        void loadCandles()
      }
      if (old?.market && (old.market.id !== market.id || (old.market.status === 'open' && market.status !== 'open'))) void session.loadHistory()
    }
  }
  const send = async (intent: MarketPositionRequest): Promise<void> => {
    if (disposed || view.sending) return
    if (!writeMarketPending(storage, view.scope, intent)) {
      update({ error: '浏览器暂时无法保存待确认请求，请允许本地存储后再调整仓位。' })
      return
    }
    update({ pending: intent, sending: true, error: null })
    cache.pending = intent
    try {
      const response = await transport.request('/position', intent)
      const result = parseMarketPositionResponse(response.body)
      if (result.request_id !== intent.request_id) throw new Error('request receipt mismatch')
      adopt(result.state, response.scope)
      cache.pending = null; writeMarketPending(storage, view.scope, null)
      update({ pending: null, error: result.accepted ? null : rejectionCopy(result.reason) })
    } catch (error) {
      update({ status: 'offline', error: error instanceof MarketHttpError ? error.message : '这笔仓位尚未确认，请核对原请求；不会重新生成订单。' })
    } finally { update({ sending: false }) }
  }
  const session: MarketSession = {
    getSnapshot: () => view,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async start() {
      source?.close(); source = null
      try {
        const response = await transport.request('')
        adopt(parseMarketState(response.body), response.scope)
        if (disposed) return
        source = transport.events((body, scope) => {
          try { adopt(parseMarketState(body), scope) } catch { update({ status: 'offline', error: '社区状态未通过核对，正在等待重新连接。' }) }
        }, () => update({ status: 'offline', error: '连接暂时中断，正在自动重连；仓位仍由服务器保管。' }))
        await session.loadHistory()
      } catch (error) {
        update({ status: error instanceof MarketHttpError && error.status === 404 ? 'unsupported' : 'offline', error: error instanceof Error ? error.message : '社区暂不可用' })
      }
    },
    async submit(intent) {
      if (view.pending || view.sending) throw new Error('请先核对上一笔未确认的仓位')
      if (view.status !== 'live') throw new Error('连接恢复后才能调整仓位')
      await send({ ...intent, request_id: transport.requestId() })
    },
    async retryPending() { if (view.pending) await send(view.pending) },
    async loadHistory(more = false) {
      if (disposed || view.historyLoading || (more && !view.nextCursor)) return
      update({ historyLoading: true })
      try {
        const query = new URLSearchParams({ limit: '20' })
        if (more && view.nextCursor) query.set('cursor', view.nextCursor)
        const response = await transport.request(`/history?${query}`)
        adoptScope(response.scope)
        const page = parseMarketHistoryResponse(response.body)
        const receipts = [...(more ? view.receipts : []), ...page.receipts].filter((receipt, i, all) => all.findIndex(other => other.id === receipt.id) === i).slice(-60)
        cache.receipts = [...page.receipts, ...cache.receipts]; save()
        update({ receipts, nextCursor: page.next_cursor })
      } catch { update({ error: '历史回执暂未更新，已确认的钱包不受影响。' }) }
      finally { update({ historyLoading: false }) }
    },
    dispose() { save(); disposed = true; source?.close(); transport.dispose(); listeners.clear() },
  }
  return session
}

function rejectionCopy(reason: string | null): string {
  if (reason?.includes('balance') || reason?.includes('incense')) return '可用香火不足，冻结资金不能重复投入。'
  if (reason?.includes('lock') || reason?.includes('closed')) return '本批已封盘，原仓位保持不变。'
  return '本次调整未成交，请以当前服务器仓位为准。'
}
