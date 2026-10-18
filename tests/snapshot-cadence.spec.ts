import { afterEach, describe, expect, it, vi } from 'vitest'
import { startSnapshotCadence } from '../src/host/snapshot-cadence.ts'
import { FakeAuthoritativeLiangService } from '../src/host/fake-service.ts'
import { snapshotRefreshMs } from '../src/shared/snapshot-cadence.ts'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
describe('Host adopts the live authoritative cadence', () => {
  it('reschedules from bootstrap, ignores ordinary frames, and cleans every timer', async () => {
    vi.useFakeTimers()
    const service = new FakeAuthoritativeLiangService({ timezone: 'Asia/Shanghai', tokenPerIncense: 50_000,
      snapshotRefreshSeconds: 7, seed: 'empty', caseTitle: 'cadence' }, { now: () => Date.now() }, () => undefined)
    let ready = false, seconds = 7
    vi.spyOn(service, 'isReady', 'get').mockImplementation(() => ready)
    const original = service.getWireState.bind(service)
    vi.spyOn(service, 'getWireState').mockImplementation(() => ({ ...original(), snapshotRefreshSeconds: seconds }))
    const tick = vi.spyOn(service, 'tick')
    const stop = startSnapshotCadence(service, 2)
    await vi.advanceTimersByTimeAsync(1_999)
    expect(tick).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(tick).toHaveBeenCalledTimes(1)
    service.markReadyMemoryOnly('test'); ready = true; service.refreshNow()
    await vi.advanceTimersByTimeAsync(6_000)
    expect(tick).toHaveBeenCalledTimes(1)
    // An ordinary state notification must not postpone the pending poll.
    service.refreshNow()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(tick).toHaveBeenCalledTimes(2)
    seconds = 1; service.refreshNow()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(tick).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(1)
    stop()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(tick).toHaveBeenCalledTimes(3)
  })
  it('bounds malformed or oversized cadence without exposing a user setting', () => {
    expect(snapshotRefreshMs(0, 3)).toBe(3_000)
    expect(snapshotRefreshMs(Number.NaN)).toBe(1_000)
    expect(snapshotRefreshMs(1.5)).toBe(1_000)
    expect(snapshotRefreshMs(100_000)).toBe(3_600_000)
  })
})
