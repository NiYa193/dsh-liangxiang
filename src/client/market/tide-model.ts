import { MARKET_CANDLE_INTERVAL_MS, type MarketCandle } from '../../shared/market-v1.ts'
import { marketTime } from './chart-model.ts'

export interface TideSample { at: number, ratio: number }
export interface TideGap { from: number, until: number }
export interface VolumeBubble {
  at: number
  until: number
  last_sample_at: number
  ratio: number
  volume: bigint
  up: bigint | null
  down: bigint | null
  radius: number
}

/** Completed five-minute closes live at the bucket end; a forming close is never drawn in the future. */
export function marketTideSegments(candles: readonly MarketCandle[], observedAt: number): TideSample[][] {
  const result: TideSample[][] = []
  let current: TideSample[] = [], previousAt: number | null = null
  const flush = (): void => { if (current.length) result.push(current); current = [] }
  for (const candle of candles) {
    if (candle.at > observedAt) break
    if (candle.close === null) { flush(); previousAt = null; continue }
    if (previousAt !== null && candle.at !== previousAt + MARKET_CANDLE_INTERVAL_MS) flush()
    current.push({ at: Math.min(candle.at + MARKET_CANDLE_INTERVAL_MS, observedAt), ratio: candle.close })
    previousAt = candle.at
  }
  flush()
  return result
}

export function marketTideGaps(candles: readonly MarketCandle[]): TideGap[] {
  const gaps: TideGap[] = []
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!, previous = candles[i - 1]
    if (previous && candle.at > previous.at + MARKET_CANDLE_INTERVAL_MS) gaps.push({ from: previous.at + MARKET_CANDLE_INTERVAL_MS, until: candle.at })
  }
  return gaps
}

/** This zero-order hold intentionally has no curved/interpolated price geometry. */
export function marketTidePath(samples: readonly TideSample[], project: (sample: TideSample) => { x: number, y: number }, bottom: number): { line: string, area: string } {
  if (samples.length === 0) return { line: '', area: '' }
  const first = project(samples[0]!), last = project(samples[samples.length - 1]!)
  let line = `M${first.x.toFixed(2)},${first.y.toFixed(2)}`
  for (const sample of samples.slice(1)) {
    const p = project(sample)
    line += `H${p.x.toFixed(2)}V${p.y.toFixed(2)}`
  }
  return { line, area: samples.length < 2 ? '' : `${line}L${last.x.toFixed(2)},${bottom.toFixed(2)}L${first.x.toFixed(2)},${bottom.toFixed(2)}Z` }
}

/** At most 48 half-hour bubbles per day, sourced from accepted community volume only. */
export function marketVolumeBubbles(candles: readonly MarketCandle[]): VolumeBubble[] {
  const windowMs = 6 * MARKET_CANDLE_INTERVAL_MS
  const groups = new Map<number, Omit<VolumeBubble, 'radius'>>()
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!
    if (candle.volume <= 0 || candle.close === null) continue
    const previous = candles[i - 1]
    let up: bigint | null = null, down: bigint | null = null
    if (previous && previous.at + MARKET_CANDLE_INTERVAL_MS === candle.at) {
      const u = BigInt(candle.up_votes) - BigInt(previous.up_votes), d = BigInt(candle.down_votes) - BigInt(previous.down_votes)
      if (u >= 0n && d >= 0n && u + d === BigInt(candle.volume)) { up = u; down = d }
    }
    const at = Math.floor(candle.at / windowMs) * windowMs
    const existing = groups.get(at)
    if (!existing) groups.set(at, { at, until: at + windowMs, last_sample_at: candle.at, ratio: candle.close, volume: BigInt(candle.volume), up, down })
    else {
      existing.volume += BigInt(candle.volume)
      existing.last_sample_at = candle.at; existing.ratio = candle.close
      existing.up = existing.up !== null && up !== null ? existing.up + up : null
      existing.down = existing.down !== null && down !== null ? existing.down + down : null
    }
  }
  return [...groups.values()].slice(-48).map(group => ({ ...group, radius: 3 + Math.sqrt(Number(group.volume > 121n ? 121n : group.volume)) }))
}

export function marketBubbleLabel(bubble: VolumeBubble, timezone: string): string {
  const detail = bubble.up === null || bubble.down === null ? '方向明细未确认' : `夯 ${bubble.up.toLocaleString('zh-CN')} · 拉 ${bubble.down.toLocaleString('zh-CN')}`
  return `${marketTime(bubble.at, timezone)}—${marketTime(bubble.until, timezone)} · 本场新增 ${bubble.volume.toLocaleString('zh-CN')} 炷 · ${detail}`
}
