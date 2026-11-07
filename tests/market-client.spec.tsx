import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import type { ReactElement } from 'react'
import { MARKET_CACHE_MAX_BYTES, type MarketBatch, type MarketState, type MarketReceipt } from '../src/shared/market-v1.ts'
import { compareMarketPoints, expectedReturn, positionMood, chartRange } from '../src/client/market/chart-model.ts'
import { boundedMarketCache, cacheBytes, emptyMarketCache, MARKET_CACHE_KEY, readMarketCache, writeMarketCache, readMarketAnimation, writeMarketAnimation, type MarketStorage } from '../src/client/market/market-cache.ts'
import { createMarketSession, type MarketResponse, type MarketSession, type MarketTransport, type MarketView } from '../src/client/market/market-client.ts'
import { MarketDialog } from '../src/client/market/MarketDialog.tsx'
import { wireToViewState } from '../src/client/store.ts'
import { FakeAuthoritativeLiangService } from '../src/host/fake-service.ts'
import { parseWireState } from '../src/shared/wire.ts'
import { LIANGZI_POLICY_VERSION } from '../src/domain/liangzi.ts'

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup(element: ReactElement): string }
function state(): MarketState {
  const schedule = [[9, 11, 12], [12, 17, 18], [18, 20, 21]] as const
  return { schema_version: 1, server_time: DAY + 10 * HOUR, soft_trust: true,
    wallet: { available_incense: 100, frozen_incense: 0, total_incense: 100, token_remainder: 49_999, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'case-2026-11-06', at: DAY + 10 * HOUR, up_votes: 55, down_votes: 45, sequence: 1 },
    market: { id: 'market-2026-11-06', case_id: 'case-2026-11-06', business_date: '2026-11-06', timezone: 'UTC', rule_version: 'liangxiang-market-v1', opens_at: DAY + 9 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: schedule.map(([open, lock, reference], index) => ({ batch: (index + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR, reference_at: DAY + reference * HOUR, status: index === 0 ? 'open' : 'pending', reference: null, long_incense: 0, short_incense: 0, position: null, result: null })) }
  }
}
function batch(side: 'long' | 'short' = 'long'): MarketBatch {
  return { ...state().market!.batches[0]!, status: 'live', reference: { case_id: 'case-2026-11-06', at: DAY + 12 * HOUR, up_votes: 50, down_votes: 50, sequence: 1 }, long_incense: 30, short_incense: 20, position: { side, amount: 10, submitted_at: DAY + 10 * HOUR, payout: null } }
}
function memoryStorage(): MarketStorage {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
function receipt(index: number): MarketReceipt {
  return { id: `receipt-${index}`, market_id: `market-${index}`, business_date: '2026-11-06', settled_at: DAY + index, invested_incense: 10, returned_incense: 20, pnl_incense: 10, close_point: null,
    batches: [{ batch: 1, side: 'long', amount: 10, payout: 20, result: 'long', reference: null }] }
}

describe('market visual accounting', () => {
  it('does not mistake lifetime wallet funds for today earnings or reset carried progress', () => {
    const service = new FakeAuthoritativeLiangService({ timezone: 'UTC', tokenPerIncense: 50_000, snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '测试梁案' }, { now: () => DAY + 10 * HOUR }, () => undefined)
    service.markReadyMemoryOnly('test')
    const frame = service.getWireState()
    const wallet = { ...state().wallet, available_incense: 85, frozen_incense: 20, total_incense: 105 }
    const parsed = parseWireState({ ...frame, authorityMode: 'DEV_STAGING_ONLY', personal: { ...frame.personal, effectiveTokensToday: 500_000, usedIncenseToday: 15, remainingIncense: 85, earnedIncenseToday: 10, wallet } })
    const view = wireToViewState(parsed, 'live')
    expect(view.personal.earnedIncenseToday).toBe(10)
    expect(view.personal.usedIncenseToday).toBe(15)
    expect(view.personal.remainingIncense).toBe(85)
    expect(view.personal.tokenRemainder).toBe(49_999)
    expect(view.personal.tokensToNextIncense).toBe(1)
  })
  it('shows finalized usage awaiting acknowledgment as progress, never spendable incense', () => {
    const service = new FakeAuthoritativeLiangService({ timezone: 'UTC', tokenPerIncense: 50_000, snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '测试梁案' }, { now: () => DAY + 10 * HOUR }, () => undefined)
    service.markReadyMemoryOnly('test')
    const frame = service.getWireState()
    const parsed = parseWireState({ ...frame, authorityMode: 'DEV_STAGING_ONLY', personal: { ...frame.personal, effectiveTokensToday: 550_002, confirmedEffectiveTokensToday: 500_000, usedIncenseToday: 15, remainingIncense: 100, earnedIncenseToday: 10, wallet: state().wallet } })
    const view = wireToViewState(parsed, 'live')
    expect(view.personal.remainingIncense).toBe(100)
    expect(view.personal.earnedIncenseToday).toBe(10)
    expect(view.observedEarnedIncenseToday).toBe(12)
    expect(view.personal.tokenRemainder).toBe(1)
    expect(view.personal.tokensToNextIncense).toBe(49_999)
  })
  it('uses the right direction for short positions and seals the final state', () => {
    const s = state(), b = batch('short')
    expect(positionMood(b, s.current_point)).toBe('behind')
    expect(positionMood(b, { ...s.current_point!, up_votes: 45, down_votes: 55 })).toBe('ahead')
    expect(positionMood({ ...b, result: 'short' }, s.current_point)).toBe('won')
    expect(positionMood({ ...b, reference: null }, s.current_point)).toBe('waiting')
  })
  it('compares raw fractions past six displayed decimals and refuses another case', () => {
    const reference = { ...state().current_point!, up_votes: 1_000_000_000, down_votes: 1_000_000_000 }
    expect(compareMarketPoints({ ...reference, up_votes: 1_000_000_001 }, reference)).toBe(1)
    expect(compareMarketPoints({ ...reference, case_id: 'another-case' }, reference)).toBeNull()
    expect(compareMarketPoints({ ...reference, up_votes: 0, down_votes: 0 }, reference)).toBeNull()
  })
  it('pool payout does not grow linearly as the price moves further', () => {
    const b = batch(), point = state().current_point!
    expect(expectedReturn(b, point)).toBe(16)
    expect(expectedReturn(b, { ...point, up_votes: 99, down_votes: 1 })).toBe(16)
    expect(expectedReturn(b, { ...point, up_votes: 40, down_votes: 60 })).toBe(0)
    expect(expectedReturn(b, { ...point, up_votes: 50, down_votes: 50 })).toBe(10)
  })
  it('includes reference and live prices in the chart range', () => {
    const result = chartRange([], [batch().reference, state().current_point])
    expect(result.min).toBeLessThan(.5)
    expect(result.max).toBeGreaterThan(.55)
  })
})

describe('bounded non-authoritative market cache', () => {
  it('caps candles, receipts and total UTF16 storage, and never stores a wallet', () => {
    const cache = emptyMarketCache('identity-a')
    cache.receipts = Array.from({ length: 40 }, (_, i) => receipt(i))
    cache.candles = Array.from({ length: 12 }, (_, i) => ({ case_id: `case-${i}`, business_date: `2026-11-${String(i + 1).padStart(2, '0')}`, candles: [] }))
    const bounded = boundedMarketCache(cache)
    expect(bounded.receipts).toHaveLength(30)
    expect(bounded.candles).toHaveLength(7)
    expect(cacheBytes(JSON.stringify(bounded))).toBeLessThanOrEqual(MARKET_CACHE_MAX_BYTES)
    expect(JSON.stringify(bounded)).not.toContain('available_incense')
  })
  it('isolates identities and handles corrupt or oversized cache without throwing', () => {
    const storage = memoryStorage(), cache = emptyMarketCache('identity-a')
    cache.receipts = [receipt(1)]
    writeMarketCache(storage, cache)
    expect(readMarketCache(storage, 'identity-b').receipts).toEqual([])
    expect(readMarketCache(storage, 'identity-a').receipts).toHaveLength(1)
    storage.setItem(MARKET_CACHE_KEY, '{broken')
    expect(readMarketCache(storage, 'identity-a').receipts).toEqual([])
    storage.setItem(MARKET_CACHE_KEY, 'x'.repeat(MARKET_CACHE_MAX_BYTES))
    expect(readMarketCache(storage, 'identity-a').receipts).toEqual([])
    expect(storage.getItem(MARKET_CACHE_KEY)).toBeNull()
  })
  it('defaults to system motion preference and persists only the local choice', () => {
    const storage = memoryStorage()
    expect(readMarketAnimation(storage, true)).toBe(false)
    writeMarketAnimation(storage, true)
    expect(readMarketAnimation(storage, true)).toBe(true)
    writeMarketAnimation(storage, false)
    expect(readMarketAnimation(storage, false)).toBe(false)
  })
})

describe('market transport state machine', () => {
  function fixture() {
    const current = state(), calls: string[] = [], ids: string[] = []
    let handler: ((body: unknown, scope: string) => void) | null = null
    let uncertain = false, closed = 0, disposed = false
    const transport: MarketTransport = {
      async request(path, intent): Promise<MarketResponse> {
        calls.push(path)
        if (path.startsWith('/candles')) return { body: { schema_version: 1, case_id: current.market!.case_id, business_date: current.market!.business_date, interval_ms: 300_000, candles: [], next_cursor: null }, scope: 'identity-a' }
        if (path.startsWith('/history')) return { body: { schema_version: 1, receipts: [], next_cursor: null }, scope: 'identity-a' }
        if (intent) {
          ids.push(intent.request_id)
          if (uncertain) { uncertain = false; throw new Error('network interrupted') }
          return { body: { accepted: true, reason: null, request_id: intent.request_id, state: current }, scope: 'identity-a' }
        }
        return { body: current, scope: 'identity-a' }
      },
      events(onState) { handler = onState; return { close() { closed++ } } },
      requestId: () => `request-${ids.length + 1}`,
      dispose() { disposed = true },
    }
    return { current, calls, ids, transport, setUncertain: () => { uncertain = true }, feed: (data: MarketState) => handler?.(data, 'identity-a'), closed: () => closed, disposed: () => disposed }
  }
  it('starts with only today candles and a twenty-receipt page, without polling', async () => {
    const f = fixture(), session = createMarketSession(f.transport, memoryStorage())
    await session.start()
    expect(f.calls).toHaveLength(3)
    expect(f.calls.find(path => path.startsWith('/candles'))).toContain('limit=288')
    expect(f.calls.find(path => path.startsWith('/history'))).toContain('limit=20')
    f.feed({ ...f.current, server_time: f.current.server_time + 1_000 })
    expect(f.calls).toHaveLength(3)
    session.dispose()
    expect(f.closed()).toBe(1)
    expect(f.disposed()).toBe(true)
  })
  it('persists uncertainty and retries the exact request, never a fresh id', async () => {
    const f = fixture(), storage = memoryStorage(), session = createMarketSession(f.transport, storage)
    await session.start(); f.setUncertain()
    await session.submit({ market_id: f.current.market!.id, batch: 1, side: 'short', amount: 10 })
    expect(session.getSnapshot().pending?.request_id).toBe('request-1')
    expect(readMarketCache(storage, 'identity-a').pending?.request_id).toBe('request-1')
    f.feed({ ...f.current, server_time: f.current.server_time + 1 })
    expect(session.getSnapshot().error).toContain('核对原请求')
    expect(session.getSnapshot().pending?.request_id).toBe('request-1')
    await session.retryPending()
    expect(f.ids).toEqual(['request-1', 'request-1'])
    expect(session.getSnapshot().pending).toBeNull()
    session.dispose()
  })
  it('does not persist private cached history without an identity scope', async () => {
    const f = fixture(), storage = memoryStorage()
    const request = f.transport.request
    f.transport.request = async (...args) => ({ ...await request(...args), scope: '' })
    const session = createMarketSession(f.transport, storage)
    await session.start()
    expect(storage.getItem(MARKET_CACHE_KEY)).toBeNull()
    session.dispose()
  })
})

describe('market dialog rendering', () => {
  it('exposes frozen funds, direction controls, motion toggle and readable pool semantics', () => {
    const s = state()
    const view: MarketView = { state: s, status: 'live', candles: [], receipts: [], nextCursor: null, pending: null, sending: false, historyLoading: false, error: null, chartError: null, scope: 'identity-a' }
    const session: MarketSession = { getSnapshot: () => view, subscribe: () => () => undefined, start: async () => {}, submit: async () => {}, retryPending: async () => {}, loadHistory: async () => {}, dispose: () => {} }
    const html = renderToStaticMarkup(<MarketDialog reducedMotion online onClose={() => {}} session={session} />)
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="交易动画"')
    expect(html).toContain('data-animated="false"')
    expect(html).toContain('P1 总投入香火')
    expect(html).toContain('冻结')
    expect(html).toContain('三次定线')
    expect(html).toContain('data-liangxiang-market-main-whale')
    const shown = renderToStaticMarkup(<MarketDialog reducedMotion online onClose={() => {}} session={session}
      presentation={{ caseId: s.market!.case_id, policyId: LIANGZI_POLICY_VERSION, title: '同案标题' }} />)
    expect(shown).toContain('同案标题')
    expect(shown).toContain(' · 梁总')
    const stale = renderToStaticMarkup(<MarketDialog reducedMotion online onClose={() => {}} session={session}
      presentation={{ caseId: 'another-case', policyId: LIANGZI_POLICY_VERSION, title: '旧案标题' }} />)
    expect(stale).not.toContain('旧案标题')
    expect(stale).not.toContain(' · 梁总')
  })
})
