/** Backend cadence wins online; bound timers even during rolling upgrades. */
export function snapshotRefreshMs(seconds: number, fallback = 1): number {
  const safeFallback = Number.isSafeInteger(fallback) && fallback > 0 ? fallback : 1
  const value = Number.isSafeInteger(seconds) && seconds > 0 ? seconds : safeFallback
  return Math.min(3600, Math.max(1, value)) * 1000
}
