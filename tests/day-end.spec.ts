import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeAuthoritativeLiangService } from '../src/host/fake-service.ts'
import { DayEndService } from '../src/host/day-end-service.ts'
import { businessDayEndsAt, createBusinessDateProvider } from '../src/shared/business-date.ts'
import { DEFAULT_DAY_END, parseDayEndState, type DayEndState, type DayEndPersistence } from '../src/shared/day-end.ts'
import type { LiangHostService } from '../src/host/service.ts'
import type { WireVoteRequest } from '../src/shared/wire.ts'

const before = Date.UTC(2026, 9, 19, 15, 58, 59)
const live = new Set<DayEndService>()
afterEach(() => { for (const service of live) service.dispose(); live.clear(); vi.useRealTimers(); vi.restoreAllMocks() })

function setup(enabled = true, remaining = 8) {
  vi.useFakeTimers()
  vi.setSystemTime(before)
  const clock = { now: () => Date.now() }
  const inner = new FakeAuthoritativeLiangService({ timezone: 'Asia/Shanghai', tokenPerIncense: 50_000,
    snapshotRefreshSeconds: 1, seed: 'empty', caseTitle: '日终测试', starterIncense: 0 }, clock, () => undefined)
  inner.markReadyMemoryOnly('test')
  if (remaining > 0) inner.creditSimulatedUsage(remaining * 50_000)
  let state: DayEndState = { ...structuredClone(DEFAULT_DAY_END), enabled }
  const persistence: DayEndPersistence = {
    getDayEndState: () => structuredClone(state),
    setDayEndState: vi.fn(async next => { state = structuredClone(next) }),
  }
  let changing = false
  const wrap = () => {
    const service = new DayEndService(inner, clock, () => changing, () => undefined)
    live.add(service)
    service.attachDayEndPersistence(persistence)
    service.startDayEnd()
    return service
  }
  const service = wrap()
  return { inner, service, persistence, wrap, state: () => state, changing: (value: boolean) => { changing = value } }
}

describe('one opt-in day-end dump', () => {
  it('defaults off; setting a direction does not enable or vote', async () => {
    const s = setup(false)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await s.service.setDayEndPreferences({ enabled: false, voteType: 'down' })
    await vi.advanceTimersByTimeAsync(50_000)
    expect(vote).not.toHaveBeenCalled()
    expect(s.service.getWireState().dayEnd).toEqual({ available: true, enabled: false, voteType: 'down' })
  })

  it('waits for 23:59, persists before sending, and dumps only once', async () => {
    const s = setup()
    const original = s.inner.vote.bind(s.inner)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote').mockImplementation(intent => {
      expect(s.state().jobs.local?.requestId).toBe(intent.requestId)
      return original(intent)
    })
    await vi.advanceTimersByTimeAsync(999)
    expect(vote).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(vote).toHaveBeenCalledTimes(1)
    expect(vote.mock.calls[0]?.[0]).toMatchObject({ count: 8, voteType: 'up' })
    expect(s.state().jobs.local?.done).toBe(true)
    expect(s.inner.getWireState().personal.remainingIncense).toBe(0)
    s.inner.creditSimulatedUsage(50_000)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(vote).toHaveBeenCalledTimes(1)
  })

  it('preserves the ordinary per-request maximum instead of looping over sticks', async () => {
    const s = setup(true, 800)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(vote).toHaveBeenCalledTimes(1)
    expect(vote.mock.calls[0]?.[0].count).toBe(500)
    expect(s.inner.getWireState().personal.remainingIncense).toBe(750)
  })

  it('lets an in-flight manual vote finish and rereads its remaining balance', async () => {
    const s = setup()
    const original = s.inner.vote.bind(s.inner)
    let finish: (() => void) | undefined
    const held = new Promise<void>(resolve => { finish = resolve })
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote').mockImplementationOnce(async intent => { await held; return original(intent) })
    const pending = s.service.vote({ caseId: s.inner.getWireState().activeCase.id, voteType: 'down', requestId: 'manual-one', count: 1 })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(vote).toHaveBeenCalledTimes(1)
    finish?.(); await pending
    await vi.advanceTimersByTimeAsync(2_000)
    expect(vote).toHaveBeenCalledTimes(2)
    expect(vote.mock.calls[1]?.[0].count).toBe(7)
    expect(s.inner.getWireState().personal.usedIncenseToday).toBe(8)
  })

  it('protects a held gesture before any manual request exists, with bounded cancellation', async () => {
    const s = setup()
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    s.service.noteManualGesture()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(vote).not.toHaveBeenCalled()
    // A cancelled gesture releases its lease without a browser callback.
    await vi.advanceTimersByTimeAsync(3_000)
    expect(vote).toHaveBeenCalledTimes(1)
    expect(vote.mock.calls[0]?.[0].count).toBe(8)
  })

  it('restarts an uncertain accepted request with the identical durable intent', async () => {
    const s = setup()
    const original = s.inner.vote.bind(s.inner)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote').mockImplementationOnce(intent => {
      original(intent)
      throw new Error('receipt lost')
    })
    await vi.advanceTimersByTimeAsync(1_000)
    const first = vote.mock.calls[0]?.[0]
    expect(s.state().jobs.local?.done).toBe(false)
    s.service.dispose()
    s.wrap()
    await vi.advanceTimersByTimeAsync(1)
    expect(vote).toHaveBeenCalledTimes(2)
    expect(vote.mock.calls[1]?.[0]).toEqual(first)
    expect(s.inner.getWireState().personal.usedIncenseToday).toBe(8)
    expect(s.state().jobs.local?.done).toBe(true)
  })

  it('never sends an unpersisted intent', async () => {
    const s = setup()
    vi.mocked(s.persistence.setDayEndState).mockRejectedValue(new Error('disk unavailable'))
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await vi.advanceTimersByTimeAsync(12_000)
    expect(vote).not.toHaveBeenCalled()
  })

  it('stops retries before midnight and never carries yesterday intent into today', async () => {
    const s = setup()
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote').mockImplementation(() => { throw new Error('offline') })
    await vi.advanceTimersByTimeAsync(61_000)
    const calls = vote.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(vote).toHaveBeenCalledTimes(calls)
  })

  it('does not vote after a late startup or while a mode transition owns the ledger', async () => {
    const s = setup()
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    s.changing(true)
    await vi.advanceTimersByTimeAsync(58_000)
    s.changing(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(vote).not.toHaveBeenCalled()
  })

  it('uses the saved direction and cancellation stops a pending schedule', async () => {
    const s = setup()
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    await s.service.setDayEndPreferences({ enabled: true, voteType: 'down' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(vote.mock.calls[0]?.[0].voteType).toBe('down')
    const other = setup()
    const otherVote = vi.spyOn(other.inner as LiangHostService, 'vote')
    await other.service.setDayEndPreferences({ enabled: false, voteType: 'up' })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(otherVote).not.toHaveBeenCalled()
  })

  it('serializes manual calls and retains their distinct request IDs', async () => {
    const s = setup(false)
    let active = 0, maximum = 0
    const original = s.inner.vote.bind(s.inner)
    vi.spyOn(s.inner as LiangHostService, 'vote').mockImplementation(async intent => {
      active++; maximum = Math.max(maximum, active)
      await Promise.resolve()
      const outcome = original(intent); active--; return outcome
    })
    const intent = { caseId: s.inner.getWireState().activeCase.id, voteType: 'up' } as const
    const outcomes = await Promise.all(Array.from({ length: 8 }, (_, i) => s.service.vote({ ...intent, requestId: `manual-${i}` })))
    expect(maximum).toBe(1)
    expect(outcomes.every(o => o.result.status === 'accepted')).toBe(true)
    expect(s.inner.getWireState().personal.usedIncenseToday).toBe(8)
  })

  it('keeps a queued request on its original authority rather than retargeting it', async () => {
    const s = setup(false)
    const vote = vi.spyOn(s.inner as LiangHostService, 'vote')
    const request: WireVoteRequest = { caseId: s.inner.getWireState().activeCase.id, voteType: 'up', requestId: 'mode-safe' }
    const pending = s.service.vote(request)
    const other = setup(false)
    s.service.use(other.inner, false)
    await expect(pending).rejects.toThrow('切换')
    expect(vote).not.toHaveBeenCalled()
  })
})

describe('business clock and durable preference boundary', () => {
  it('finds business midnight across short and long DST days', () => {
    const london = createBusinessDateProvider('Europe/London')
    const short = Date.UTC(2026, 2, 29)
    expect(businessDayEndsAt(london, short) - short).toBe(23 * 3_600_000)
    const long = Date.UTC(2026, 9, 24, 23)
    expect(businessDayEndsAt(london, long) - long).toBe(25 * 3_600_000)
  })
  it('rejects invalid preferences and corrupt durable payloads', () => {
    expect(parseDayEndState(DEFAULT_DAY_END)).toEqual(DEFAULT_DAY_END)
    expect(() => parseDayEndState({ enabled: true, voteType: 'neutral', jobs: {} })).toThrow()
    expect(() => parseDayEndState({ enabled: true, voteType: 'up', jobs: { online: { count: 501 } } })).toThrow()
  })
})
