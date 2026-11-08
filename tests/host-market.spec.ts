import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendLiangService } from '../src/host/backend-service.ts'
import { createBackendClient, type BackendClient } from '../src/host/backend-client.ts'
import { FakeAuthoritativeLiangService } from '../src/host/fake-service.ts'
import { createLiangxiangApi } from '../src/host/routes.ts'
import type { LiangHostService } from '../src/host/service.ts'
import type { BackendStreamStatus } from '../src/host/backend-event-stream.ts'
import { parseMarketCandlesQuery, parseMarketHistoryQuery } from '../src/host/market-query.ts'
import { parseWireState } from '../src/shared/wire.ts'
import type { MarketPositionRequest, MarketState, MarketStreamEvent } from '../src/shared/market-v1.ts'
import { communityAuthMessage, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../src/shared/backend-v1.ts'
import { generateCommunityKeypair, sha256Base64Url, verifyCommunitySignature } from '../src/host/community-keys.ts'
import { createBackendFixture } from './helpers/backend.ts'

const ID = 'inst-market-host-001'
const WALLET = { available_incense: 35, frozen_incense: 5, total_incense: 40, token_remainder: 2_000, token_per_incense: 50_000, version: 2 }
const POSITION: MarketPositionRequest = { market_id: 'market-2026-08-16', batch: 2, side: 'short', amount: 7, request_id: 'req-market-host-001' }
const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function pause(): Promise<void> { await new Promise(resolve => setTimeout(resolve, 0)) }

async function hostHarness() {
  const fixture = createBackendFixture()
  const base = fixture.service.bootstrap(ID)
  const bootstrap = { ...base, authoritative_personal_state: { ...base.authoritative_personal_state,
    claimed_effective_tokens: 500_000, starter_tokens: 0, earned_incense: 10, used_incense: 18,
    remaining_incense: 35, token_remainder: 2_000, tokens_to_next_incense: 48_000, wallet: WALLET } }
  const initial: MarketState = { schema_version: 1, server_time: fixture.clock.now(), soft_trust: true,
    wallet: WALLET, market: null, current_point: null }
  const requests: Array<{ path: string, body: string | null }> = []
  const handlers: Array<Parameters<NonNullable<BackendClient['subscribeEvents']>>[1]> = []
  let stopped = 0
  const client = createBackendClient({ baseUrl: 'http://127.0.0.1:4180', fetchImpl: (async (input, init) => {
    const path = new URL(String(input)).pathname
    requests.push({ path, body: typeof init?.body === 'string' ? init.body : null })
    let payload: unknown
    if (path.endsWith('/bootstrap')) payload = bootstrap
    else if (path.endsWith('/market/position')) payload = { accepted: true, reason: null, request_id: POSITION.request_id,
      state: { ...initial, wallet: { ...WALLET, available_incense: 28, frozen_incense: 12, version: 3 } } }
    else if (path.endsWith('/market')) payload = initial
    else if (path.endsWith('/snapshot')) payload = fixture.service.snapshotResponse()
    else if (path.endsWith('/me/daily-state')) payload = { ...fixture.service.dailyState(ID), authoritative_personal_state: bootstrap.authoritative_personal_state }
    else throw new Error(`unexpected request ${path}`)
    return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch })
  client.subscribeEvents = (_id, options) => { handlers.push(options); return () => { stopped += 1 } }
  const service = new BackendLiangService({ client, timezone: 'Asia/Shanghai', clock: fixture.clock, claimDebounceMs: 0, warn: () => undefined })
  service.attachIdentity(ID)
  await service.refreshBootstrap()
  cleanups.push(() => { service.dispose(); fixture.close() })
  return { service, client, fixture, requests, handlers, initial, stopped: () => stopped }
}

describe('cumulative wallet Host authority', () => {

  it('applies every part of a cloud frame before notifying any browser', async () => {
    const { service, fixture, handlers, initial } = await hostHarness()
    const market = fixture.service.marketState(ID)
    const candle = { at: initial.server_time, open: 0.4, high: 0.6, low: 0.3, close: 0.5, up_votes: 9, down_votes: 9, volume: 18 }
    const snapshot = fixture.service.snapshotResponse()
    const observed: Array<{ wire: ReturnType<typeof service.getWireState>, market: MarketState | null }> = []
    const unsubscribe = service.subscribe(() => observed.push({ wire: service.getWireState(), market: service.cachedMarketState() }))
    handlers[0]!.onEvent({ schema_version: 1, epoch: 'complete-frame', revision: 1, server_time: initial.server_time,
      snapshot, market_state: { ...market, wallet: WALLET }, candle, candle_interval_ms: 60_000 })
    expect(observed).toHaveLength(1)
    for (const revision of [2, 3]) handlers[0]!.onEvent({ schema_version: 1, epoch: 'complete-frame', revision,
      server_time: initial.server_time, market_state: { ...market, wallet: WALLET },
      candle: { ...candle, volume: 17 + revision }, candle_interval_ms: 60_000 })
    unsubscribe()
    expect(observed.map(frame => frame.market?.current_candle?.volume)).toEqual([18, 19, 20])
    expect(observed[0]!.market).toMatchObject({ wallet: WALLET, current_candle: candle, candle_interval_ms: 60_000 })
    expect(observed[0]!.wire.global.sequence).toBe(snapshot.global_snapshot.sequence)
    expect(observed[0]!.wire.businessDate).toBe(snapshot.business_date)
  })

  it('shares only concurrent cold reads with the same query and authority revision', async () => {
    const { service, client } = await hostHarness()
    let resolve!: (value: { schema_version: 1, receipts: [], next_cursor: null }) => void
    const read = vi.fn(() => new Promise<{ schema_version: 1, receipts: [], next_cursor: null }>(r => { resolve = r }))
    client.marketHistory = read
    const first = service.marketHistory({ limit: 20 })
    const second = service.marketHistory({ limit: 20 })
    expect(read).toHaveBeenCalledTimes(1)
    resolve({ schema_version: 1, receipts: [], next_cursor: null })
    expect(await first).toEqual(await second)
    const next = service.marketHistory({ limit: 20 })
    expect(read).toHaveBeenCalledTimes(2)
    resolve({ schema_version: 1, receipts: [], next_cursor: null }); await next
  })

  it('does not attach a post-write query to an older in-flight read', async () => {
    const { service, client } = await hostHarness()
    const resolvers: Array<(value: { schema_version: 1, receipts: [], next_cursor: null }) => void> = []
    const read = vi.fn(() => new Promise<{ schema_version: 1, receipts: [], next_cursor: null }>(r => resolvers.push(r)))
    client.marketHistory = read
    const older = service.marketHistory({ limit: 20 })
    await service.marketPosition(POSITION)
    const newer = service.marketHistory({ limit: 20 })
    const pageTwo = service.marketHistory({ cursor: '2', limit: 20 })
    expect(read).toHaveBeenCalledTimes(3)
    for (const resolve of resolvers) resolve({ schema_version: 1, receipts: [], next_cursor: null })
    await Promise.all([older, newer, pageTwo])
  })

  it('fences reads across an uncertain position response as well as accepted writes', async () => {
    const { service, client } = await hostHarness()
    let reject!: (error: Error) => void
    client.marketPosition = () => new Promise((_resolve, r) => { reject = r })
    const resolvers: Array<(value: { schema_version: 1, receipts: [], next_cursor: null }) => void> = []
    const read = vi.fn(() => new Promise<{ schema_version: 1, receipts: [], next_cursor: null }>(r => resolvers.push(r)))
    client.marketHistory = read
    const writing = expect(service.marketPosition(POSITION)).rejects.toThrow('response lost')
    await pause()
    const during = service.marketHistory({ limit: 20 })
    reject(new Error('response lost')); await writing
    const after = service.marketHistory({ limit: 20 })
    expect(read).toHaveBeenCalledTimes(2)
    for (const resolve of resolvers) resolve({ schema_version: 1, receipts: [], next_cursor: null })
    await Promise.all([during, after])
  })

  it('retries a failed cold read and preserves candle query boundaries', async () => {
    const { service, client } = await hostHarness()
    const page = { schema_version: 1 as const, case_id: 'case-a', business_date: '2026-08-16', interval_ms: 60_000 as const, candles: [], next_cursor: null }
    const read = vi.fn(async () => page)
    read.mockRejectedValueOnce(new Error('temporary history outage'))
    client.marketCandles = read
    await expect(service.marketCandles({ case_id: 'case-a' })).rejects.toThrow('temporary history outage')
    await Promise.all([service.marketCandles({ case_id: 'case-a' }), service.marketCandles({ case_id: 'case-b' }),
      service.marketCandles({ case_id: 'case-a', interval_ms: 300_000 })])
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('reuses a healthy cloud market for subscription but keeps explicit reads and outage calibration', async () => {
    const { service, client, fixture, handlers, initial } = await hostHarness()
    const state = { ...fixture.service.marketState(ID), wallet: WALLET }
    const read = vi.fn(async () => state)
    client.market = read
    const stream = handlers[0]!
    stream.onStatus('connected')
    stream.onEvent({ schema_version: 1, epoch: 'subscription', revision: 1, server_time: initial.server_time, market_state: state })
    await service.market()
    expect(await service.marketForSubscription()).toEqual(service.cachedMarketState())
    expect(read).toHaveBeenCalledTimes(1)
    await service.market(); expect(read).toHaveBeenCalledTimes(2)
    stream.onStatus('disconnected')
    await service.marketForSubscription(); expect(read).toHaveBeenCalledTimes(3)
  })

  it('binds market query strings and position bodies to the installation signature', async () => {
    const identity = generateCommunityKeypair(null)
    const verified: string[] = []
    const state: MarketState = { schema_version: 1, server_time: Date.now(), soft_trust: true, wallet: WALLET, market: null, current_point: null }
    const client = createBackendClient({ baseUrl: 'http://127.0.0.1:4180', signer: () => identity,
      fetchImpl: (async (input, init) => {
        const url = new URL(String(input))
        const headers = new Headers(init?.headers)
        const body = typeof init?.body === 'string' ? init.body : ''
        const message = communityAuthMessage({ method: init?.method ?? 'GET', path: url.pathname + url.search,
          timestamp: headers.get(TIMESTAMP_HEADER) ?? '', bodySha256: sha256Base64Url(body), installationId: identity.installationId })
        expect(verifyCommunitySignature(identity.publicKey, message, headers.get(SIGNATURE_HEADER) ?? '')).toBe(true)
        verified.push(url.pathname + url.search)
        if (url.pathname.endsWith('/history')) return new Response(JSON.stringify({ schema_version: 1, receipts: [], next_cursor: null }))
        return new Response(JSON.stringify({ accepted: true, reason: null, request_id: POSITION.request_id, state }))
      }) as typeof fetch })
    try {
      await client.marketHistory!(identity.installationId, { cursor: 'page one', limit: 20 })
      await client.marketPosition!(identity.installationId, POSITION)
      expect(verified).toEqual(['/v1/market/history?cursor=page+one&limit=20', '/v1/market/position'])
    } finally { client.dispose() }
  })

  it('keeps daily usage honest while spending prior-day funds and exposes authoritative frozen money', async () => {
    const { service } = await hostHarness()
    const wire = parseWireState(service.getWireState())
    expect(wire.personal.effectiveTokensToday).toBe(500_000)
    expect(wire.personal.usedIncenseToday).toBe(18)
    expect(wire.personal.earnedIncenseToday).toBe(10)
    expect(wire.personal.remainingIncense).toBe(35)
    expect(wire.personal.wallet?.frozen_incense).toBe(5)
  })

  it('submits one minimal position intent and immediately projects the frozen balance', async () => {
    const { service, requests } = await hostHarness()
    const outcome = await service.marketPosition(POSITION)
    expect(outcome.accepted).toBe(true)
    const sent = requests.filter(request => request.path.endsWith('/market/position'))
    expect(sent).toHaveLength(1)
    expect(JSON.parse(sent[0]!.body!)).toEqual(POSITION)
    expect(requests.filter(request => request.path.endsWith('/token-claims'))).toHaveLength(0)
    expect(service.getWireState().personal.remainingIncense).toBe(28)
    expect(service.cachedMarketState()?.wallet.frozen_incense).toBe(12)
  })

  it('uses one cloud stream instead of tick polling and resumes polling when disconnected', async () => {
    const { service, requests, handlers, initial, stopped } = await hostHarness()
    expect(handlers).toHaveLength(1)
    const stream = handlers[0]!
    stream.onStatus('connected')
    stream.onEvent({ schema_version: 1, epoch: 'backend-a', revision: 1, server_time: initial.server_time, market_state: initial })
    for (let i = 0; i < 10; i += 1) service.tick()
    await pause()
    expect(requests.filter(request => request.path.endsWith('/snapshot'))).toHaveLength(0)
    stream.onStatus('disconnected')
    service.tick()
    await pause()
    expect(requests.filter(request => request.path.endsWith('/snapshot'))).toHaveLength(1)
    service.dispose()
    expect(stopped()).toBe(1)
  })

  it('rejects old frames, accepts a fresh reconnect epoch and retains the latest wallet', async () => {
    const { service, handlers, initial } = await hostHarness()
    const stream = handlers[0]!
    stream.onStatus('connected')
    const frame = (revision: number, available: number, walletVersion: number): MarketStreamEvent => ({
      schema_version: 1, epoch: 'backend-a', revision, server_time: initial.server_time,
      market_state: { ...initial, wallet: { ...WALLET, available_incense: available, total_incense: available + 5, version: walletVersion } },
    })
    stream.onEvent(frame(2, 40, 4))
    stream.onEvent(frame(1, 99, 99))
    expect(service.getWireState().personal.remainingIncense).toBe(40)
    stream.onStatus('connecting')
    stream.onStatus('connected')
    stream.onEvent(frame(1, 45, 5))
    expect(service.getWireState().personal.remainingIncense).toBe(45)
  })

  it('moves the cached market point on another voter\'s public snapshot without waiting for a wallet event', async () => {
    const { service, fixture, handlers, initial } = await hostHarness()
    const stream = handlers[0]!
    const at = initial.server_time
    const caseId = service.getWireState().activeCase.id
    stream.onEvent({ schema_version: 1, epoch: 'backend-a', revision: 1, server_time: at,
      market_state: { ...initial, market: { id: POSITION.market_id, case_id: caseId,
        business_date: service.getWireState().businessDate, timezone: 'Asia/Shanghai', rule_version: 'liangxiang-market-v1',
        opens_at: at + 1_000, closes_at: at + 100_000, status: 'open', close_point: null,
        batches: ([1, 2, 3] as const).map(batch => ({ batch, opens_at: at + batch * 1_000,
          locks_at: at + batch * 1_000 + 100, reference_at: at + batch * 1_000 + 200,
          status: 'pending', reference: null, long_incense: 0, short_incense: 0, position: null, result: null })) } } })
    fixture.grantIncense('inst-market-other-001', 1)
    fixture.service.vote('inst-market-other-001', { case_id: caseId, vote_type: 'up', request_id: 'req-market-other-001' })
    const snapshot = fixture.service.snapshotResponse()
    const candle = { at: Math.floor(at / 300_000) * 300_000, open: 1, high: 1, low: 1, close: 1,
      up_votes: 1, down_votes: 0, volume: 1 }
    stream.onEvent({ schema_version: 1, epoch: 'backend-a', revision: 2, server_time: at, snapshot, candle })
    expect(service.cachedMarketState()?.current_point?.up_votes).toBe(1)
    expect(service.cachedMarketState()?.current_point?.sequence).toBe(snapshot.global_snapshot.sequence)
    expect(service.getWireState().personal.wallet?.version).toBe(WALLET.version)
    expect(service.cachedMarketState()?.current_candle).toEqual(candle)
    stream.onEvent({ schema_version: 1, epoch: 'backend-a', revision: 3, server_time: at + 60_000,
      candle: { ...candle, at: candle.at + 60_000, volume: 0 }, candle_interval_ms: 60_000 })
    expect(service.cachedMarketState()?.server_time).toBe(at + 60_000)
    expect(service.cachedMarketState()?.candle_interval_ms).toBe(60_000)
  })

  it('retains old-backend normal voting cadence when events are unsupported', async () => {
    const { service, handlers, requests } = await hostHarness()
    handlers[0]!.onStatus('unsupported' satisfies BackendStreamStatus)
    service.tick()
    await pause()
    expect(requests.filter(request => request.path.endsWith('/snapshot'))).toHaveLength(1)
    expect(service.getWireState().authorityAvailable).toBe(true)
  })

  it('does not retain a larger five-minute candle after the server switches to real minute data', async () => {
    const { service, handlers, initial } = await hostHarness()
    const stream = handlers[0]!, time = Math.floor(initial.server_time / 300_000) * 300_000
    const old = { at: time, open: .5, high: .6, low: .4, close: .5, up_votes: 50, down_votes: 50, volume: 100 }
    stream.onEvent({ schema_version: 1, epoch: 'minute-upgrade', revision: 1, server_time: initial.server_time,
      market_state: { ...initial, current_candle: old, candle_interval_ms: 300_000 } })
    const minute = { ...old, up_votes: 1, down_votes: 1, volume: 2 }
    stream.onEvent({ schema_version: 1, epoch: 'minute-upgrade', revision: 2, server_time: initial.server_time + 1,
      market_state: { ...initial, current_candle: minute, candle_interval_ms: 60_000 } })
    expect(service.cachedMarketState()?.current_candle).toEqual(minute)
    expect(service.cachedMarketState()?.candle_interval_ms).toBe(60_000)
    expect(service.getWireState().personal.wallet).toEqual(WALLET)
  })

  it('never shares an in-flight private market read with a replacement identity', async () => {
    const { service, client, initial } = await hostHarness()
    let finishOld!: (state: MarketState) => void
    let calls = 0
    client.market = async () => {
      calls += 1
      if (calls === 1) return new Promise<MarketState>(resolve => { finishOld = resolve })
      return { ...initial, wallet: { ...WALLET, available_incense: 10, total_incense: 15, version: 6 } }
    }
    const oldScope = service.marketCacheScope()
    const oldRead = service.market()
    service.attachIdentity('inst-market-replacement-001')
    expect(service.cachedMarketState()).toBeNull()
    expect(service.marketCacheScope()).not.toBe(oldScope)
    await service.refreshBootstrap()
    const next = await service.market()
    expect(next.wallet.available_incense).toBe(10)
    finishOld({ ...initial, wallet: { ...WALLET, available_incense: 99, total_incense: 104, version: 99 } })
    await oldRead
    expect(calls).toBe(2)
    expect(service.cachedMarketState()?.wallet.available_incense).toBe(10)
  })
})

async function apiHarness(modeChanging = false) {
  const inner = new FakeAuthoritativeLiangService({ timezone: 'Asia/Shanghai', tokenPerIncense: 50_000,
    snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '今日梁案' }, { now: () => Date.UTC(2026, 7, 16, 4) }, () => undefined)
  inner.markReadyMemoryOnly('market route test')
  let state: MarketState | null = { schema_version: 1, server_time: Date.UTC(2026, 7, 16, 4), soft_trust: true,
    wallet: WALLET, market: null, current_point: null }
  const subscribers = new Set<() => void>()
  const intents: MarketPositionRequest[] = []
  const service: LiangHostService = {
    isReady: true, getWireState: () => inner.getWireState(), subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener) },
    history: () => inner.history(), vote: intent => inner.vote(intent), observeUsage: () => undefined,
    setAccountingAvailable: () => undefined, markReadyMemoryOnly: () => undefined, tick: () => undefined,
    market: async () => state!, cachedMarketState: () => state, marketCacheScope: () => 'a'.repeat(64),
    marketPosition: async intent => { intents.push(intent); return { accepted: true, reason: null, request_id: intent.request_id, state: state! } },
    marketCandles: async () => ({ schema_version: 1, case_id: 'case-2026-08-16', business_date: '2026-08-16', interval_ms: 300_000, candles: [], next_cursor: null }),
    marketHistory: async () => ({ schema_version: 1, receipts: [], next_cursor: null }),
  }
  const api = createLiangxiangApi(service, () => undefined, { selectAuthorityMode: () => undefined, isAuthorityModeChanging: () => modeChanging })
  const server = createServer((req, res) => { void api.handler(req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('market test bind failed')
  cleanups.push(async () => { api.closeAllConnections(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  return { url: `http://127.0.0.1:${address.port}/liangxiang/api/market`, intents,
    invalidate: () => { state = null; for (const subscriber of subscribers) subscriber() } }
}

describe('market Host route boundary', () => {
  it('bounds pages and rejects unknown/duplicate query parameters', () => {
    expect(parseMarketCandlesQuery(new URLSearchParams('limit=288&business_date=2026-08-16'))).toEqual({ limit: 288, business_date: '2026-08-16' })
    for (const query of ['limit=289', 'limit=0', 'limit=1.2', 'cursor=x&cursor=y', 'installation_id=other', 'business_date=bad']) {
      expect(() => parseMarketCandlesQuery(new URLSearchParams(query))).toThrow()
    }
    expect(() => parseMarketHistoryQuery(new URLSearchParams('limit=51'))).toThrow()
  })

  it('requires JSON and forwards a validated intent without accepting client balances', async () => {
    const { url, intents } = await apiHarness()
    const post = (body: unknown, json = true) => fetch(`${url}/position`, { method: 'POST',
      headers: json ? { 'content-type': 'application/json' } : {}, body: JSON.stringify(body) })
    expect((await post(POSITION, false)).status).toBe(415)
    expect((await post({ ...POSITION, remaining_incense: 999 })).status).toBe(400)
    expect((await post({ ...POSITION, amount: 0.5 })).status).toBe(400)
    expect((await post(POSITION)).status).toBe(200)
    expect(intents).toEqual([POSITION])
    expect((await fetch(`${url}/history?limit=51`)).status).toBe(400)
    const response = await fetch(url)
    expect(response.headers.get('x-liangxiang-cache-scope')).toBe('a'.repeat(64))
  })

  it('blocks a position during authority handoff and ends a market stream when its mode disappears', async () => {
    const changing = await apiHarness(true)
    expect((await fetch(`${changing.url}/position`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(POSITION) })).status).toBe(503)
    const harness = await apiHarness()
    const response = await fetch(`${harness.url}/events`)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain('"cache_scope":"' + 'a'.repeat(64))
    harness.invalidate()
    expect((await reader.read()).done).toBe(true)
    reader.releaseLock()
  })
})
