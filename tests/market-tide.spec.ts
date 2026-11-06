import { describe, expect, it } from 'vitest'
import type { MarketCandle } from '../src/shared/market-v1.ts'
import { chartRange } from '../src/client/market/chart-model.ts'
import { marketBubbleLabel, marketTideGaps, marketTidePath, marketTideSegments, marketVolumeBubbles } from '../src/client/market/tide-model.ts'

const STEP = 300_000
function candle(at: number, close: number | null = .5, up = 10, down = 10, volume = 0): MarketCandle {
  return { at, open: close, high: close, low: close, close, up_votes: up, down_votes: down, volume }
}

describe('authoritative close-series geometry', () => {
  it('places completed closes at bucket end and a forming close at its observation time', () => {
    const segments = marketTideSegments([candle(0, .4), candle(STEP, .6), candle(2 * STEP, .7)], STEP + 42_000)
    expect(segments).toEqual([[{ at: STEP, ratio: .4 }, { at: STEP + 42_000, ratio: .6 }]])
  })
  it('splits missing and null buckets rather than joining them with invented prices', () => {
    const candles = [candle(0, .4), candle(STEP, .5), candle(3 * STEP, .6), candle(4 * STEP, null), candle(5 * STEP, .7)]
    const segments = marketTideSegments(candles, 6 * STEP)
    expect(segments.map(segment => segment.length)).toEqual([2, 1, 1])
    expect(marketTideGaps(candles)).toEqual([{ from: 2 * STEP, until: 3 * STEP }])
    const paths = segments.map(segment => marketTidePath(segment, p => ({ x: p.at / STEP, y: 100 - p.ratio * 100 }), 100))
    expect(paths[0]!.line).toBe('M1.00,60.00H2.00V50.00')
    expect(paths[0]!.line).not.toMatch(/[CQSA]/i)
    expect(paths[1]!.area).toBe('')
    expect(paths[2]!.line.startsWith('M6.00')).toBe(true)
  })
  it('keeps zero-vote data empty instead of inventing a half-full pond', () => {
    expect(marketTideSegments([candle(0, null, 0, 0)], STEP)).toEqual([])
    expect(marketVolumeBubbles([candle(0, null, 0, 0)])).toEqual([])
  })
  it('does not flatten close geometry with unrendered intrabucket extremes', () => {
    const candles = [{ ...candle(0, .5), high: 1, low: 0 }]
    expect(chartRange(candles, [], 'ohlc')).toEqual({ min: 0, max: 1 })
    expect(chartRange(candles, [], 'close').max).toBeLessThan(.55)
    expect(chartRange(candles, [], 'close').min).toBeGreaterThan(.45)
    expect(chartRange(candles, [{ at: 0, case_id: 'case-test', up_votes: 90, down_votes: 10, sequence: 1 }], 'close').max).toBeGreaterThan(.9)
  })
})

describe('community-volume bubbles', () => {
  it('uses official volume and reports directions only with an adjacent matching count delta', () => {
    const bubbles = marketVolumeBubbles([candle(0, .5, 100, 100, 0), candle(STEP, 103 / 205, 103, 102, 5), candle(2 * STEP, 103 / 208, 103, 105, 3)])
    expect(bubbles).toHaveLength(1)
    expect(bubbles[0]!.volume).toBe(8n)
    expect(bubbles[0]!.up).toBe(3n)
    expect(bubbles[0]!.down).toBe(5n)
    expect(marketBubbleLabel(bubbles[0]!, 'UTC')).toContain('本场新增 8 炷')
    expect(marketBubbleLabel(bubbles[0]!, 'UTC')).toContain('夯 3 · 拉 5')
  })
  it('does not infer directions from first cumulative counts or across a gap', () => {
    const first = marketVolumeBubbles([candle(STEP, .5, 1000, 1000, 4)])[0]!
    expect(first.volume).toBe(4n)
    expect(first.up).toBeNull()
    expect(marketBubbleLabel(first, 'UTC')).toContain('方向明细未确认')
    expect(marketBubbleLabel(first, 'UTC')).not.toContain('全网')
    const gap = marketVolumeBubbles([candle(0), candle(2 * STEP, .5, 12, 12, 4)])[0]!
    expect(gap.up).toBeNull()
    const inconsistent = marketVolumeBubbles([candle(0), candle(STEP, .5, 12, 12, 5)])[0]!
    expect(inconsistent.up).toBeNull()
  })
  it('bounds a full day to 48 particles with a finite radius even after large dumps', () => {
    const bubbles = marketVolumeBubbles(Array.from({ length: 288 }, (_, index) => candle(index * STEP, .5, (index + 1) * 250, (index + 1) * 250, 500)))
    expect(bubbles).toHaveLength(48)
    expect(bubbles.every(b => b.radius <= 14 && Number.isFinite(b.radius))).toBe(true)
    expect(bubbles.reduce((total, b) => total + b.volume, 0n)).toBe(144_000n)
  })
})
