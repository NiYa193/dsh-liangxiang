import { createRequire } from 'node:module'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { CandleLayer, MarketChart } from '../src/client/market/MarketChart.tsx'
import { marketAutomaticInterval, marketDisplayCandles, marketViewportCandles } from '../src/client/market/candle-view.ts'
import { chartRange } from '../src/client/market/chart-model.ts'
import { marketBubbleDirection, marketDepthBands } from '../src/client/market/pond-model.ts'
import { LEGACY_LIANGZI_POLICY_VERSION, LIANGZI_POLICY_VERSION } from '../src/domain/liangzi.ts'
import type { MarketState } from '../src/shared/market-v1.ts'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup(element: ReactElement): string }
const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000
function state(): MarketState {
  const point = { case_id: 'market-chart-case', at: DAY + 19 * HOUR, up_votes: 55, down_votes: 45, sequence: 1 }
  return { schema_version: 1, soft_trust: true, server_time: point.at, current_point: point,
    wallet: { available_incense: 20, frozen_incense: 20, total_incense: 40, token_remainder: 0, token_per_incense: 50_000, version: 1 },
    market: { id: 'market-chart', case_id: point.case_id, business_date: '2026-11-06', timezone: 'UTC', rule_version: 'liangxiang-market-v1', opens_at: DAY + 9 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: ([1, 2, 3] as const).map(batch => ({ batch, opens_at: DAY + (batch === 1 ? 9 : batch === 2 ? 12 : 18) * HOUR, locks_at: DAY + (batch === 1 ? 11 : batch === 2 ? 17 : 20) * HOUR,
        reference_at: DAY + (batch === 1 ? 12 : batch === 2 ? 18 : 21) * HOUR, status: batch === 3 ? 'open' : 'live', reference: batch === 3 ? null : { ...point, up_votes: 50, down_votes: 50 },
        long_incense: 10, short_incense: 10, position: batch === 3 ? null : { side: batch === 1 ? 'long' : 'short', amount: 10, submitted_at: DAY + 10 * HOUR, payout: null }, result: null })) },
  }
}

describe('readable official market chart, independent of the header illustration', () => {
  it('keeps a forming candle at or before the observation boundary', () => {
    const start = DAY + 10 * HOUR
    const candles = [{ at: start, open: .4, high: .5, low: .4, close: .5, up_votes: 10, down_votes: 10, volume: 0 }]
    for (const elapsed of [0, 30_000, 150_000, 180_000]) {
      const observedAt = start + elapsed
      const html = renderToStaticMarkup(<svg><CandleLayer candles={candles} from={DAY} until={DAY + 24 * HOUR} min={0} max={1} observedAt={observedAt} sourceIntervalMs={300_000} /></svg>)
      const x = Number(html.match(/<line x1="([^"]+)"/)![1])
      const displayedAt = DAY + (x - 12) / 684 * 24 * HOUR
      expect(displayedAt).toBeLessThanOrEqual(observedAt)
      expect(displayedAt).toBe(Math.min(start + 150_000, observedAt))
    }
  })

  it('defaults to K lines, shows the complete business day and reserves future hours without inventing prices', () => {
    const s = state()
    const candles = [{ at: DAY + 10 * HOUR, open: .4, high: .5, low: .4, close: .5, up_votes: 10, down_votes: 10, volume: 0 }]
    const html = renderToStaticMarkup(<MarketChart state={s} candles={candles} animated={false} />)
    expect(html).toContain(`data-liangxiang-market-from="${DAY}"`)
    expect(html).toContain(`data-liangxiang-market-until="${DAY + 24 * HOUR}"`)
    for (const label of ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00']) expect(html).toContain(`>${label}</text>`)
    expect(html).toContain('data-liangxiang-market-future=""')
    expect(html).toContain('待打梁')
    expect(html).toContain('data-liangxiang-market-chart-mode="candles"')
    expect(html).toContain('data-liangxiang-market-interval="900000"')
    expect(html).toContain('data-liangxiang-market-phase="before"')
    expect(html.match(/data-liangxiang-market-phase="open"/g)).toHaveLength(3)
    expect(html.match(/data-liangxiang-market-phase="locked"/g)).toHaveLength(3)
    expect(html).toContain('data-liangxiang-market-phase="closing"')
    expect(html).not.toContain('data-liangxiang-market-tide-area')
    expect(html.match(/data-liangxiang-market-candle=/g)).toHaveLength(1)
    expect(html).not.toContain('data-liangxiang-market-whale-art')
    s.server_time = DAY + 25 * HOUR
    expect(renderToStaticMarkup(<MarketChart state={s} candles={candles} animated={false} />)).not.toContain('data-liangxiang-market-future')
  })

  it('separates the four OHLC values and numeric price axis from decorative content', () => {
    const candles = [{ at: DAY + 18 * HOUR, open: .4, high: .6, low: .3, close: .5, up_votes: 10, down_votes: 10, volume: 4 }]
    const html = renderToStaticMarkup(<MarketChart state={state()} candles={candles} animated={false} />)
    expect(html.match(/data-liangxiang-market-price-axis=/g)).toHaveLength(5)
    for (const [key, value] of [['open', '40.000000%'], ['high', '60.000000%'], ['low', '30.000000%'], ['close', '50.000000%']]) {
      const quote = html.match(new RegExp(`<b[^>]*data-liangxiang-market-quote="${key}"[^>]*>([^<]+)</b>`))
      expect(quote?.[1]).toBe(value)
      expect(quote?.[0]).toContain(`title="${value}"`)
    }
    expect(html).not.toContain('data-liangxiang-market-main-whale')
    expect(html).toContain('data-direction="unknown"')
    expect(html).not.toContain('liangxiang-market-volume-bubble')
  })

  it('offers a real interval selection and never advertises one-minute detail for legacy records', () => {
    const minute = renderToStaticMarkup(<MarketChart state={state()} candles={[]} animated={false} candlesIntervalMs={60_000} />)
    expect(minute).toContain('aria-label="烛线间隔"')
    expect(minute).toContain('<option value="60000">1分钟</option>')
    expect(minute).toContain('自动·15分钟')
    const legacy = renderToStaticMarkup(<MarketChart state={state()} candles={[]} animated={false} candlesIntervalMs={300_000} />)
    expect(legacy).toContain('<option value="60000" disabled="">1分钟</option>')
    expect(legacy).toContain('这段记录最细为5分钟')
  })

  it('shows only the supplied supported case policy, including legacy boundaries', () => {
    expect(marketDepthBands()).toEqual([])
    expect(marketDepthBands('unknown-policy')).toEqual([])
    const current = marketDepthBands(LIANGZI_POLICY_VERSION)
    const legacy = marketDepthBands(LEGACY_LIANGZI_POLICY_VERSION)
    expect(current).toHaveLength(6)
    expect(current[0]).toMatchObject({ state: 'xiao_nan_liang', label: '小难梁', low: 0, high: .25 })
    expect(legacy).toHaveLength(5)
    expect(legacy[0]).toMatchObject({ state: 'liang_gong', label: '梁工', low: 0, high: .5 })
    const s = state()
    const hidden = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} liangziPolicyId="unknown-policy" />)
    expect(hidden).not.toContain('data-liangxiang-market-zone=')
    const shown = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} liangziPolicyId={LIANGZI_POLICY_VERSION} />)
    expect(shown).toContain('梁总')
    expect(shown).not.toContain('data-liangxiang-market-zone=')
  })

  it('colours directional bubbles only from a confirmed majority', () => {
    expect(marketBubbleDirection({ up: 10n, down: 2n })).toBe('up')
    expect(marketBubbleDirection({ up: 2n, down: 10n })).toBe('down')
    expect(marketBubbleDirection({ up: null, down: 10n })).toBeNull()
    expect(marketBubbleDirection({ up: 10n, down: null })).toBeNull()
    expect(marketBubbleDirection({ up: 10n, down: 10n })).toBeNull()
  })

  it('changes the selected reference without moving the official current price marker', () => {
    const s = state()
    const long = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} selectedBatch={1} />)
    const short = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} selectedBatch={2} />)
    const dot = (html: string): string | undefined => html.match(/<circle data-liangxiang-market-current-point=""[^>]+>/)?.[0]
    expect(dot(short)).toEqual(dot(long))
    expect(dot(long)).toBeDefined()
    expect(long).not.toContain('foreignObject')
  })

  it('leaves a zero-vote pond without an invented numeric water point', () => {
    const s = state()
    s.current_point = null
    s.market!.batches = s.market!.batches.map(batch => ({ ...batch, reference: null, position: null }))
    const html = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} />)
    expect(html).toContain('当前 --')
    expect(html).not.toContain('data-liangxiang-market-current-point')
    expect(html).not.toContain('50.000000%')
    expect(html).not.toContain('<image')
  })

  it('uses only visible candle extremes when examining the recent window', () => {
    const candles = [{ at: DAY, open: 0, high: 1, low: 0, close: 1, up_votes: 10, down_votes: 0, volume: 0 },
      { at: DAY + 18 * HOUR, open: .5, high: .51, low: .49, close: .5, up_votes: 10, down_votes: 10, volume: 0 }]
    const whole = renderToStaticMarkup(<MarketChart state={state()} candles={candles} animated={false} />)
    const recent = renderToStaticMarkup(<MarketChart state={state()} candles={candles} animated={false} recent />)
    expect(whole).toContain('>100.00%</text>')
    expect(recent).not.toContain('>100.00%</text>')
    expect(recent).toContain('data-liangxiang-market-interval="300000"')
  })
  it('renders real records before the trading window instead of treating 00–09 as missing history', () => {
    const candles = [2, 8, 10].map(hour => ({ at: DAY + hour * HOUR, open: .4, high: .5, low: .4, close: .5, up_votes: 10, down_votes: 10, volume: 0 }))
    const html = renderToStaticMarkup(<MarketChart state={state()} candles={candles} animated={false} candlesIntervalMs={60_000} />)
    expect(html.match(/data-liangxiang-market-candle=/g)).toHaveLength(3)
    expect(html).toContain('data-liangxiang-market-phase="before"')
  })
})

describe('official candle display aggregation', () => {
  const STEP = 300_000
  const c = (at: number, open = .4, close = .5, up = 10, down = 10, volume = 0) => ({ at, open, close, high: Math.max(open, close) + .01, low: Math.min(open, close) - .01, up_votes: up, down_votes: down, volume })
  it('uses the first open, extrema and last close, retaining unknown volume instead of faking directions', () => {
    const grouped = marketDisplayCandles([c(0, .4, .5, 10, 10, 2), c(STEP, .5, .7, 13, 11, 4), c(STEP * 2, .7, .6, 14, 14, 4)], STEP * 3, 0, STEP)
    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({ at: 0, until: STEP * 3, samples: 3, open: .4, close: .6, high: .71, low: .39, volume: 10, confirmed_up: 4, confirmed_down: 4, unknown_volume: 2 })
  })
  it('does not combine across missing or null samples, including within one display bucket', () => {
    const gap = marketDisplayCandles([c(0), c(STEP * 2)], STEP * 3, 0, STEP)
    expect(gap).toHaveLength(2)
    const empty = { ...c(STEP), open: null, high: null, low: null, close: null }
    const nulls = marketDisplayCandles([c(0), empty, c(STEP * 2)], STEP * 3, 0, STEP)
    expect(nulls).toHaveLength(3)
    expect(nulls[1]!.close).toBeNull()
  })
  it('anchors groups to the actual business midnight and preserves total integer volume', () => {
    const origin = 12_345
    const candles = Array.from({ length: 12 }, (_, i) => c(origin + i * STEP, .4, .5, i + 10, i + 10, 2))
    const grouped = marketDisplayCandles(candles, STEP * 3, origin, STEP)
    expect(grouped.map(c => c.at)).toEqual([origin, origin + STEP * 3, origin + STEP * 6, origin + STEP * 9])
    expect(grouped.reduce((total, c) => total + c.volume, 0)).toBe(24)
    expect(grouped.reduce((total, c) => total + c.confirmed_up + c.confirmed_down + c.unknown_volume, 0)).toBe(24)
  })
  it('keeps a mismatching or decreasing cumulative delta neutral', () => {
    const grouped = marketDisplayCandles([c(0), c(STEP, .4, .5, 12, 12, 5), c(STEP * 2, .4, .5, 11, 12, 1)], STEP * 3, 0, STEP)
    expect(grouped[0]).toMatchObject({ volume: 6, confirmed_up: 0, confirmed_down: 0, unknown_volume: 6 })
  })
  it('coarsens real minute samples and cannot split a legacy five-minute candle', () => {
    const minute = 60_000
    const raw = [c(0), c(minute, .5, .6, 12, 11, 3), c(minute * 2, .6, .5, 13, 13, 3)]
    expect(marketDisplayCandles(raw, 5 * minute, 0, minute)).toMatchObject([{ at: 0, until: 3 * minute, samples: 3, volume: 6, confirmed_up: 3, confirmed_down: 3 }])
    const legacy = marketDisplayCandles([c(0)], minute, 0, STEP)
    expect(legacy).toHaveLength(1)
    expect(legacy[0]).toMatchObject({ at: 0, until: STEP, samples: 1 })
  })
  it('changes automatic density with zoom and actual plot width, bounded by the true source grain', () => {
    expect(marketAutomaticInterval(24 * HOUR, 684, 60_000)).toBe(900_000)
    expect(marketAutomaticInterval(24 * HOUR, 350, 60_000)).toBe(1_800_000)
    expect(marketAutomaticInterval(12 * HOUR, 350, 60_000)).toBe(900_000)
    expect(marketAutomaticInterval(4 * HOUR, 350, 60_000)).toBe(300_000)
    expect(marketAutomaticInterval(HOUR, 350, 60_000)).toBe(60_000)
    expect(marketAutomaticInterval(HOUR, 350, STEP)).toBe(STEP)
  })
  it('excludes offscreen bucket extremes when panning across a coarse-candle boundary', () => {
    const minute = 60_000
    const raw = Array.from({ length: 60 }, (_, i) => ({ ...c(i * minute, .5, .5), high: i < 15 ? 1 : i >= 30 ? .95 : .51 }))
    const coarse = marketDisplayCandles(raw, 15 * minute, 0, minute)
    const from = 14 * minute, until = 32 * minute, observedAt = 80 * minute
    const visible = marketViewportCandles(coarse, from, until, observedAt)
    expect(visible.map(candle => candle.at)).toEqual([15 * minute])
    expect(chartRange(coarse, []).max).toBe(1)
    expect(chartRange(visible, []).max).toBeLessThan(.6)
    const html = renderToStaticMarkup(<svg><CandleLayer candles={visible} from={from} until={until} min={.45} max={.55} observedAt={observedAt} /></svg>)
    expect(html.match(/data-liangxiang-market-candle=/g)).toHaveLength(1)
    const cx = Number(html.match(/<line x1="([^"]+)"/)![1])
    expect(cx).toBeGreaterThanOrEqual(12)
    expect(cx).toBeLessThanOrEqual(696)
  })
  it('uses the observed location of a forming candle without making a future candle visible', () => {
    const bars = marketDisplayCandles([c(60_000), c(120_000)], 60_000, 0, 60_000)
    expect(marketViewportCandles(bars, 64_000, 90_000, 65_000).map(c => c.at)).toEqual([60_000])
    expect(marketViewportCandles(bars, 66_000, 90_000, 65_000)).toEqual([])
  })
})
