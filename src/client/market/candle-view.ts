import { MARKET_CANDLE_INTERVAL_MS, type MarketCandle } from '../../shared/market-v1.ts'

/** A display bucket, never a settlement price or a replacement server candle. */
export interface MarketDisplayCandle extends MarketCandle {
  until: number
  samples: number
  confirmed_up: number
  confirmed_down: number
  unknown_volume: number
}

const priced = (c: MarketCandle): boolean => c.open !== null && c.high !== null && c.low !== null && c.close !== null

/**
 * Coarsen only adjacent official samples. A missing/null sample is a real break,
 * including when it falls inside one display bucket. Direction is reported only
 * when an adjacent cumulative-count delta exactly matches the official volume.
 */
export function marketDisplayCandles(candles: readonly MarketCandle[], intervalMs: number, origin: number, sourceIntervalMs: number = MARKET_CANDLE_INTERVAL_MS): MarketDisplayCandle[] {
  const result: MarketDisplayCandle[] = []
  let previous: MarketCandle | undefined
  const interval = Math.max(sourceIntervalMs, intervalMs)
  for (const c of candles) {
    const deltaUp = previous ? c.up_votes - previous.up_votes : -1
    const deltaDown = previous ? c.down_votes - previous.down_votes : -1
    const known = previous !== undefined && previous.at + sourceIntervalMs === c.at && deltaUp >= 0 && deltaDown >= 0 && deltaUp + deltaDown === c.volume
    const up = known ? deltaUp : 0, down = known ? deltaDown : 0, unknown = known ? 0 : c.volume
    const bucket = Math.floor((c.at - origin) / interval)
    const last = result[result.length - 1]
    const joined = last && previous && priced(previous) && priced(c) && previous.at + sourceIntervalMs === c.at && Math.floor((last.at - origin) / interval) === bucket
    if (joined) {
      last.high = Math.max(last.high!, c.high!)
      last.low = Math.min(last.low!, c.low!)
      last.close = c.close
      last.until = c.at + sourceIntervalMs
      last.up_votes = c.up_votes; last.down_votes = c.down_votes
      last.volume += c.volume; last.samples += 1
      last.confirmed_up += up; last.confirmed_down += down; last.unknown_volume += unknown
    } else result.push({ ...c, until: c.at + sourceIntervalMs, samples: 1, confirmed_up: up, confirmed_down: down, unknown_volume: unknown })
    previous = c
  }
  return result
}

/** Automatic display density follows the viewport; it never invents a finer source. */
export function marketAutomaticInterval(span: number, plotWidth: number, sourceIntervalMs: number = MARKET_CANDLE_INTERVAL_MS): number {
  const minute = 60_000
  const preferred = span <= 60 * minute ? minute : span <= 6 * 60 * minute ? 5 * minute
    : span / Math.max(1, Math.floor(plotWidth / 6)) <= 15 * minute ? 15 * minute : 30 * minute
  return Math.max(sourceIntervalMs, preferred)
}

/** Discrete zoom stops describe the actual viewport, including DST business days. */
export function marketZoomSpan(span: number, direction: 'in' | 'out', daySpan: number): number {
  const minute = 60_000
  const stops = [daySpan, 12 * 60 * minute, 6 * 60 * minute, 3 * 60 * minute, 60 * minute, 30 * minute]
    .filter((stop, index, all) => stop <= daySpan && all.indexOf(stop) === index)
  return direction === 'in' ? stops.find(stop => stop < span - 1) ?? stops[stops.length - 1]!
    : [...stops].reverse().find(stop => stop > span + 1) ?? daySpan
}

/** The range badge is a duration, never the candle grain or a stale preset. */
export function marketViewportLabel(span: number, daySpan: number): string {
  if (span === daySpan) return '今日'
  const totalSeconds = Math.max(1, Math.round(span / 1000))
  const hours = Math.floor(totalSeconds / 3600), minutes = Math.floor(totalSeconds % 3600 / 60), seconds = totalSeconds % 60
  return `近${hours ? `${hours}时` : ''}${minutes ? `${minutes}分` : ''}${seconds ? `${seconds}秒` : ''}`
}

/** Candles and volume marks are drawn at the same observed midpoint. */
export function marketViewportCandles(candles: readonly MarketDisplayCandle[], from: number, until: number, observedAt: number): MarketDisplayCandle[] {
  return candles.filter(candle => {
    if (candle.at > observedAt) return false
    const center = Math.min((candle.at + candle.until) / 2, observedAt)
    return center >= from && center <= until
  })
}
