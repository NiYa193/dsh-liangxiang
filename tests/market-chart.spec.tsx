import { createRequire } from 'node:module'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { MarketChart } from '../src/client/market/MarketChart.tsx'
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

describe('one decorative whale, independent official points', () => {
  it('keeps an unpositioned portrait inside the scene at both water-level extremes', () => {
    for (const up of [0, 100]) {
      const s = state()
      s.current_point = { ...s.current_point!, up_votes: up, down_votes: 100 - up }
      s.market!.batches = s.market!.batches.map(batch => ({ ...batch, position: null, reference: null }))
      const html = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} />)
      const art = html.match(/<image data-liangxiang-market-whale-art=""[^>]+>/)![0]
      const top = Number(art.match(/\by="([^"]+)"/)![1])
      const height = Number(art.match(/\bheight="([^"]+)"/)![1])
      expect(top).toBeGreaterThanOrEqual(-30) // Space reserved inside the toolbar/frame.
      expect(top + height).toBeLessThanOrEqual(360)
    }
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
    expect(shown.match(/data-liangxiang-market-zone=/g)).toHaveLength(6)
    expect(shown).toContain('梁总')
  })

  it('colours directional bubbles only from a confirmed majority', () => {
    expect(marketBubbleDirection({ up: 10n, down: 2n })).toBe('up')
    expect(marketBubbleDirection({ up: 2n, down: 10n })).toBe('down')
    expect(marketBubbleDirection({ up: null, down: 10n })).toBeNull()
    expect(marketBubbleDirection({ up: 10n, down: null })).toBeNull()
    expect(marketBubbleDirection({ up: 10n, down: 10n })).toBeNull()
  })

  it('changes the selected position mood without moving official prices or reference markers', () => {
    const s = state()
    const long = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} selectedBatch={1} />)
    const short = renderToStaticMarkup(<MarketChart state={s} candles={[]} animated={false} selectedBatch={2} />)
    expect(long).toContain('data-liangxiang-market-main-whale="" data-mood="ahead"')
    expect(short).toContain('data-liangxiang-market-main-whale="" data-mood="behind"')
    expect(long.match(/data-liangxiang-market-main-whale/g)).toHaveLength(1)
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
    expect(html).toContain('data-liangxiang-market-main-whale="" data-mood="waiting"')
  })
})
