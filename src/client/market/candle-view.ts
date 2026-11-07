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
export function marketDisplayCandles(candles: readonly MarketCandle[], intervalMs: number, origin: number): MarketDisplayCandle[] {
  const result: MarketDisplayCandle[] = []
  let previous: MarketCandle | undefined
  const interval = Math.max(MARKET_CANDLE_INTERVAL_MS, intervalMs)
  for (const c of candles) {
    const deltaUp = previous ? c.up_votes - previous.up_votes : -1
    const deltaDown = previous ? c.down_votes - previous.down_votes : -1
    const known = previous !== undefined && previous.at + MARKET_CANDLE_INTERVAL_MS === c.at && deltaUp >= 0 && deltaDown >= 0 && deltaUp + deltaDown === c.volume
    const up = known ? deltaUp : 0, down = known ? deltaDown : 0, unknown = known ? 0 : c.volume
    const bucket = Math.floor((c.at - origin) / interval)
    const last = result[result.length - 1]
    const joined = last && previous && priced(previous) && priced(c) && previous.at + MARKET_CANDLE_INTERVAL_MS === c.at && Math.floor((last.at - origin) / interval) === bucket
    if (joined) {
      last.high = Math.max(last.high!, c.high!)
      last.low = Math.min(last.low!, c.low!)
      last.close = c.close
      last.until = c.at + MARKET_CANDLE_INTERVAL_MS
      last.up_votes = c.up_votes; last.down_votes = c.down_votes
      last.volume += c.volume; last.samples += 1
      last.confirmed_up += up; last.confirmed_down += down; last.unknown_volume += unknown
    } else result.push({ ...c, until: c.at + MARKET_CANDLE_INTERVAL_MS, samples: 1, confirmed_up: up, confirmed_down: down, unknown_volume: unknown })
    previous = c
  }
  return result
}
