import { createRequire } from 'node:module'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { MarketFishCompanion } from '../src/client/market/MarketFishCompanion.tsx'
import { fishResponse, type FishAction } from '../src/client/market/fish-feedback.ts'
import type { PositionMood } from '../src/client/market/chart-model.ts'

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup(element: ReactElement): string }

describe('decorative header companion', () => {
  it('has distinct water, underwater and waiting dialogue without a balance or payout promise', () => {
    expect(fishResponse('ahead', 'idle')).not.toBe(fishResponse('behind', 'idle'))
    expect(fishResponse('waiting', 'idle')).not.toBe(fishResponse('ahead', 'idle'))
    expect(fishResponse('behind', 'long')).toMatch(/^咕噜，/)
    expect(fishResponse('ahead', 'submit')).toBe('等账本点头～')
    expect(fishResponse('ahead', 'confirmed')).toContain('账本点头')
    const actions: FishAction[] = ['idle', 'draft', 'submit', 'confirmed', 'withdraw', 'long', 'short', 'batch1', 'batch2', 'batch3', 'chart', 'range', 'history', 'rules', 'motion', 'interval', 'error']
    const moods: PositionMood[] = ['ahead', 'behind', 'waiting', 'even', 'won', 'lost', 'returned']
    for (const mood of moods) for (const action of actions) for (let variant = 0; variant < 8; variant++) {
      const text = fishResponse(mood, action, variant)
      expect(text.length).toBeLessThanOrEqual(24)
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toMatch(/保证|必赚|稳赚|已到账|收益到账/)
    }
  })
  it('keeps the existing artwork and two-line speech as decoration outside the focus sequence', () => {
    const html = renderToStaticMarkup(<MarketFishCompanion mood="ahead" animated reaction={{ id: 1, action: 'submit' }} />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-liangxiang-market-main-whale')
    expect(html.match(/data-liangxiang-market-whale-art=/g)).toHaveLength(1)
    expect(html).toContain('data-fish-action="submit"')
    expect(html).toContain('等回执')
    expect(html).not.toContain('aria-live')
    expect(html).not.toContain('tabindex')
    expect(html).not.toContain('<button')
  })
  it('retains an underwater pose when static or hidden and never enables decorative loops then', () => {
    for (const props of [{ animated: false }, { animated: true, visible: false }]) {
      const html = renderToStaticMarkup(<MarketFishCompanion mood="behind" {...props} reaction={null} />)
      expect(html).toContain('data-pose="dive"')
      expect(html).toContain('data-motion="false"')
      expect(html).toContain('data-liangxiang-market-water-occlusion="dive"')
      expect(html).toContain('咕噜')
    }
  })
})
