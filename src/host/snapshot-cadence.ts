import { snapshotRefreshMs } from '../shared/snapshot-cadence.ts'
import type { LiangHostService } from './service.ts'

/** One timer per Host, rebuilt only when bootstrap or authority changes cadence. */
export function startSnapshotCadence(service: LiangHostService, fallbackSeconds: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null
  let period = 0
  const update = (): void => {
    const next = snapshotRefreshMs(service.isReady ? service.getWireState().snapshotRefreshSeconds : fallbackSeconds, fallbackSeconds)
    if (next === period) return
    period = next
    if (timer !== null) clearInterval(timer)
    timer = setInterval(() => service.tick(), period)
  }
  const unsubscribe = service.subscribe(update)
  update()
  return () => {
    unsubscribe()
    if (timer !== null) clearInterval(timer)
  }
}
