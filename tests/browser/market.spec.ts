import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { MarketState, MarketPositionRequest, MarketCandle } from '../../src/shared/market-v1.ts'
import { MARKET_CACHE_MAX_BYTES } from '../../src/shared/market-v1.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

declare global {
  interface Window {
    __liangxiangMarketFrame?: (state: MarketState) => void
    __liangxiangMarketStreamsClosed?: number
  }
}

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000
function fixture(): MarketState {
  const schedule = [[9, 11, 12], [12, 17, 18], [18, 20, 21]] as const
  return { schema_version: 1, soft_trust: true, server_time: DAY + 10 * HOUR,
    wallet: { available_incense: 90, frozen_incense: 10, total_incense: 100, token_remainder: 12_000, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'case-market-browser', at: DAY + 10 * HOUR, up_votes: 55, down_votes: 45, sequence: 1 },
    market: { id: 'market-browser', case_id: 'case-market-browser', business_date: '2026-11-06', timezone: 'UTC', rule_version: 'liangxiang-market-v1', opens_at: DAY + 9 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: schedule.map(([open, lock, reference], index) => ({ batch: (index + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR, reference_at: DAY + reference * HOUR, status: index === 0 ? 'open' : 'pending', reference: null, long_incense: index === 0 ? 30 : 0, short_incense: index === 0 ? 20 : 0, position: index === 0 ? { side: 'long', amount: 10, submitted_at: DAY + 9 * HOUR, payout: null } : null, result: null })) }
  }
}

function candles(): MarketCandle[] {
  return Array.from({ length: 120 }, (_, index) => {
    const open = .49 + Math.sin(index / 8) * .035, close = .49 + Math.sin((index + 1) / 8) * .035
    return { at: DAY + index * 300_000, open, close, high: Math.max(open, close) + .004, low: Math.min(open, close) - .004, up_votes: 50 + index, down_votes: 50 + index, volume: 2 }
  })
}

test.beforeEach(async ({ page }) => {
  // UI-only mock in the real installed DSH shell. No fake wallet or position is sent to a live community.
  await page.addInitScript(() => {
    const Native = window.EventSource
    const sources = new Set<{ onmessage: ((event: MessageEvent) => void) | null }>()
    window.__liangxiangMarketStreamsClosed = 0
    window.EventSource = new Proxy(Native, {
      construct(target, args) {
        const path = new URL(String(args[0]), location.href).pathname
        if (path !== '/liangxiang/api/events' && path !== '/liangxiang/api/market/events') return Reflect.construct(target, args)
        const source = { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null,
          close() { sources.delete(source); if (path.endsWith('/market/events')) window.__liangxiangMarketStreamsClosed = (window.__liangxiangMarketStreamsClosed ?? 0) + 1 } }
        if (path.endsWith('/market/events')) sources.add(source)
        return source
      },
    })
    window.__liangxiangMarketFrame = state => {
      for (const source of sources) source.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ ...state, cache_scope: 'browser-market-scope' }) }))
    }
  })
  await page.route(/\/liangxiang\/api\/(?:state|refresh)(?:\?|$)/, async route => {
    const response = await route.fetch(), wire = await response.json() as Record<string, unknown>
    await route.fulfill({ response, json: { ...wire, authorityMode: 'DEV_STAGING_ONLY', authorityAvailable: true } })
  })
  let current = fixture()
  await page.route('**/liangxiang/api/market', route => route.fulfill({ json: current, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } }))
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: { schema_version: 1, case_id: current.market!.case_id, business_date: current.market!.business_date, interval_ms: 300_000, candles: candles(), next_cursor: null } }))
  await page.route('**/liangxiang/api/market/history?*', route => route.fulfill({ json: { schema_version: 1, receipts: [], next_cursor: null }, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } }))
  await page.route('**/liangxiang/api/market/position', async route => {
    const intent = route.request().postDataJSON() as MarketPositionRequest
    const batch = current.market!.batches[intent.batch - 1]!, old = batch.position
    const delta = intent.amount - (old?.amount ?? 0)
    if (old) { if (old.side === 'long') batch.long_incense -= old.amount; else batch.short_incense -= old.amount }
    if (intent.side === 'long') batch.long_incense += intent.amount
    else if (intent.side === 'short') batch.short_incense += intent.amount
    batch.position = intent.side ? { side: intent.side, amount: intent.amount, submitted_at: current.server_time, payout: null } : null
    current = { ...current, server_time: current.server_time + 1, wallet: { ...current.wallet, available_incense: current.wallet.available_incense - delta, frozen_incense: current.wallet.frozen_incense + delta, version: current.wallet.version + 1 } }
    await route.fulfill({ json: { accepted: true, reason: null, request_id: intent.request_id, state: current }, headers: { 'x-liangxiang-cache-scope': 'browser-market-scope' } })
  })
  await bootInstalledLiangxiang(page)
})

async function openMarket(page: Parameters<typeof openPanel>[0]) {
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-utility-trigger]').click()
  await panel.locator('[data-liangxiang-utility-market]').click()
  const dialog = page.getByRole('dialog', { name: '香火交易', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  return dialog
}

test('market keeps the four-region panel, traps focus, loads art on demand and disposes its stream', async ({ page }, testInfo) => {
  const dialog = await openMarket(page)
  await expect(dialog).toBeFocused()
  await expect.poll(() => dialog.locator('img').first().evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true)
  expect(await page.locator('[data-liangxiang-region]').count()).toBe(4)
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  }
  await dialog.screenshot({ path: testInfo.outputPath('market-independent.png') })
  const axe = await new AxeBuilder({ page }).include('[data-liangxiang-market-dialog]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('[data-liangxiang-utility-trigger]')).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.__liangxiangMarketStreamsClosed)).toBe(1)
})

test('whole-position changes freeze only the difference and short whale state follows the correct direction', async ({ page }) => {
  const dialog = await openMarket(page), first = dialog.locator('[data-liangxiang-market-batch="1"]')
  await first.getByRole('button', { name: '↘ 做空' }).click()
  await first.getByRole('spinbutton', { name: 'P1 总投入香火' }).fill('20')
  await first.getByRole('button', { name: '确认调整' }).click()
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('80')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('20')
  const live = fixture()
  live.server_time = DAY + 13 * HOUR
  live.current_point = { ...live.current_point!, at: live.server_time }
  live.market!.batches[0] = { ...live.market!.batches[0]!, status: 'live', reference: { ...live.current_point!, at: DAY + 12 * HOUR, up_votes: 50, down_votes: 50 }, position: { side: 'short', amount: 20, submitted_at: DAY + 10 * HOUR, payout: null }, long_incense: 20, short_incense: 40 }
  live.market!.batches[1] = { ...live.market!.batches[1]!, status: 'open' }
  live.wallet = { ...live.wallet, available_incense: 80, frozen_incense: 20 }
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), live)
  await expect(first).toContainText('暂时落后')
  await expect(first.locator('[data-mood="behind"]')).toBeVisible()
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), { ...live, server_time: live.server_time + 1, current_point: { ...live.current_point!, up_votes: 45, down_votes: 55, sequence: 2 } })
  await expect(first).toContainText('当前占优')
  await expect(first).toContainText('预计返还 30 炷')
  await expect(first.locator('[data-mood="ahead"]')).toBeVisible()
  await expect(first.getByRole('spinbutton')).toHaveCount(0)
})

test('motion choice is local and static mode removes transitions as well as loops', async ({ page }) => {
  const dialog = await openMarket(page), toggle = dialog.getByRole('switch', { name: '交易动画' })
  await expect(dialog).toHaveAttribute('data-animated', 'false')
  await expect(toggle).toContainText('系统减少动态')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await toggle.click()
  await expect(dialog).toHaveAttribute('data-animated', 'true')
  await toggle.click()
  await expect(dialog).toHaveAttribute('data-animated', 'false')
  const fish = dialog.locator('.liangxiang-market-whale img').first()
  expect(await fish.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  await page.keyboard.press('Escape')
  const reopened = await openMarket(page)
  await expect(reopened).toHaveAttribute('data-animated', 'false')
  const bytes = await page.evaluate(() => {
    const cache = localStorage.getItem('liangxiang.market.cache.v1') ?? ''
    const pending = localStorage.getItem('liangxiang.market.pending.v1') ?? ''
    return { bytes: (cache.length + pending.length) * 2, hasWallet: cache.includes('available_incense') }
  })
  expect(bytes.bytes).toBeLessThan(MARKET_CACHE_MAX_BYTES)
  expect(bytes.hasWallet).toBe(false)
})

test('tide defaults to truthful steps, leaves gaps open and retains the candle view', async ({ page }, testInfo) => {
  const data = candles().filter((_candle, index) => index < 48 || index >= 60)
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: { schema_version: 1, case_id: 'case-market-browser', business_date: '2026-11-06', interval_ms: 300_000, candles: data, next_cursor: null } }))
  const dialog = await openMarket(page), chart = dialog.locator('[data-liangxiang-market-chart-mode]')
  await expect(chart).toHaveAttribute('data-liangxiang-market-chart-mode', 'tide')
  const segments = chart.locator('[data-liangxiang-market-tide-segment]')
  await expect(segments).toHaveCount(2)
  const geometry = await segments.evaluateAll(nodes => nodes.map(node => ({ path: node.getAttribute('d'), x: (node as SVGGraphicsElement).getBBox().x, width: (node as SVGGraphicsElement).getBBox().width })))
  expect(geometry[0]!.x + geometry[0]!.width).toBeLessThan(geometry[1]!.x)
  expect(geometry.every(segment => !/[CQSA]/i.test(segment.path ?? ''))).toBe(true)
  const bubbles = chart.locator('[data-liangxiang-market-volume]')
  expect(await bubbles.count()).toBeGreaterThan(0)
  expect(await bubbles.count()).toBeLessThanOrEqual(48)
  await bubbles.first().hover()
  await expect(chart.locator('.liangxiang-market-chart-readout')).toContainText('本场新增')
  await expect(chart.locator('.liangxiang-market-chart-readout')).not.toContainText('全网')
  expect(await bubbles.evaluateAll(nodes => nodes.every(node => node.getAnimations().length === 0))).toBe(true)
  await chart.screenshot({ path: testInfo.outputPath('market-tide.png') })
  await chart.getByRole('button', { name: '烛线', exact: true }).click()
  await expect(chart).toHaveAttribute('data-liangxiang-market-chart-mode', 'candles')
  await expect(chart.locator('[data-liangxiang-market-tide-segment]')).toHaveCount(0)
  await expect(chart.locator('[data-liangxiang-market-candle]')).toHaveCount(data.length)
  await chart.getByRole('button', { name: '潮汐', exact: true }).click()
  await expect(segments).toHaveCount(2)
})
