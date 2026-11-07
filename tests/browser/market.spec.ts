import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { MarketState, MarketPositionRequest, MarketCandle, MarketCandlesResponse } from '../../src/shared/market-v1.ts'
import { MARKET_CACHE_MAX_BYTES } from '../../src/shared/market-v1.ts'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

declare global {
  interface Window {
    __liangxiangMarketFrame?: (state: MarketState) => void
    __liangxiangMarketStreamsClosed?: number
  }
}

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000, MINUTE = 60_000
function fixture(): MarketState {
  const schedule = [[9, 11, 12], [12, 17, 18], [18, 20, 21]] as const
  return { schema_version: 1, soft_trust: true, server_time: DAY + 10 * HOUR, candle_interval_ms: MINUTE,
    wallet: { available_incense: 90, frozen_incense: 10, total_incense: 100, token_remainder: 12_000, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'case-market-browser', at: DAY + 10 * HOUR, up_votes: 55, down_votes: 45, sequence: 1 },
    market: { id: 'market-browser', case_id: 'case-market-browser', business_date: '2026-11-06', timezone: 'UTC', rule_version: 'liangxiang-market-v1', opens_at: DAY + 9 * HOUR, closes_at: DAY + 24 * HOUR, status: 'open', close_point: null,
      batches: schedule.map(([open, lock, reference], index) => ({ batch: (index + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR, reference_at: DAY + reference * HOUR, status: index === 0 ? 'open' : 'pending', reference: null, long_incense: index === 0 ? 30 : 0, short_incense: index === 0 ? 20 : 0, position: index === 0 ? { side: 'long', amount: 10, submitted_at: DAY + 9 * HOUR, payout: null } : null, result: null })) }
  }
}

function candles(): MarketCandle[] {
  return Array.from({ length: 600 }, (_, index) => {
    const open = .49 + Math.sin(index / 40) * .035, close = .49 + Math.sin((index + 1) / 40) * .035
    return { at: DAY + index * MINUTE, open, close, high: Math.max(open, close) + .004, low: Math.min(open, close) - .004, up_votes: 50 + index, down_votes: 50 + index, volume: 2 }
  })
}

function candlePage(url: string, data: MarketCandle[]): MarketCandlesResponse {
  const query = new URL(url).searchParams, after = Number(query.get('cursor') ?? -1)
  const limit = Math.min(288, Number(query.get('limit') ?? 288))
  const remaining = data.filter(candle => candle.at > after), page = remaining.slice(0, limit)
  return { schema_version: 1, case_id: 'case-market-browser', business_date: '2026-11-06', interval_ms: MINUTE,
    candles: page, next_cursor: remaining.length > page.length ? String(page.at(-1)!.at) : null }
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
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: candlePage(route.request().url(), candles()) }))
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

test('market keeps the four-region panel, on-demand artwork, trapped focus and clean stream disposal', async ({ page }, testInfo) => {
  const artwork = page.waitForResponse(response => new URL(response.url()).pathname === '/liangxiang/api/market/art.webp')
  const dialog = await openMarket(page)
  await expect(dialog).toBeFocused()
  await expect(dialog.locator('[data-liangxiang-market-main-whale]')).toHaveCount(1)
  const fishBounds = (await dialog.locator('[data-liangxiang-market-main-whale]').boundingBox())!
  const headerBounds = (await dialog.locator('.liangxiang-market-header').boundingBox())!
  const chartBounds = (await dialog.locator('[data-liangxiang-market-chart-mode]').boundingBox())!
  expect(fishBounds.x).toBeGreaterThanOrEqual(headerBounds.x)
  expect(fishBounds.x + fishBounds.width).toBeLessThanOrEqual(headerBounds.x + headerBounds.width + 1)
  expect(fishBounds.y).toBeGreaterThanOrEqual(headerBounds.y)
  expect(fishBounds.y + fishBounds.height).toBeLessThanOrEqual(chartBounds.y + 1)
  expect((await artwork).status()).toBe(200)
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
  await expect(first.getByRole('spinbutton')).toBeDisabled()
})

test('motion choice animates local whale parts and water, while static mode keeps distinct poses', async ({ page }, testInfo) => {
  const dialog = await openMarket(page), toggle = dialog.getByRole('switch', { name: '交易动画' })
  await expect(dialog).toHaveAttribute('data-animated', 'false')
  await expect(toggle).toContainText('大鱼干')
  await expect(toggle).toHaveAttribute('title', /系统.*减少动态/)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await toggle.click()
  await expect(dialog).toHaveAttribute('data-animated', 'true')
  await expect(toggle).toContainText('大肥鱼')
  await dialog.getByRole('button', { name: '潮汐', exact: true }).click()
  const companion = dialog.locator('.liangxiang-market-companion')
  const speech = companion.locator('.liangxiang-market-companion-speech')
  const actor = companion.locator('.liangxiang-market-companion-actor')
  await expect(companion).toHaveAttribute('data-motion', 'true')
  const actorNode = await actor.elementHandle()
  // Count real one-shot motion starts while retaining the normal WAAPI call.
  // A routine Host frame must not replace the actor or play an action twice.
  await actor.evaluate(element => {
    const animate = element.animate.bind(element)
    element.setAttribute('data-test-action-plays', '0')
    element.animate = (frames, options) => {
      element.setAttribute('data-test-action-plays', String(Number(element.getAttribute('data-test-action-plays')) + 1))
      return animate(frames, options)
    }
  })
  await dialog.getByRole('button', { name: '↘ 做空', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'short')
  await expect(speech).not.toBeEmpty()
  await expect(actor).toHaveAttribute('data-test-action-plays', '1')
  const reaction = await companion.getAttribute('data-reaction-id')
  const point = dialog.locator('[data-liangxiang-market-current-point]'), initialX = await point.getAttribute('cx')
  const ordinaryFrame = fixture()
  ordinaryFrame.server_time += 1_000
  ordinaryFrame.current_point = { ...ordinaryFrame.current_point!, at: ordinaryFrame.server_time, sequence: 2 }
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), ordinaryFrame)
  await expect(point).not.toHaveAttribute('cx', initialX!)
  expect(await actorNode!.evaluate(element => element.isConnected)).toBe(true)
  await expect(companion).toHaveAttribute('data-reaction-id', reaction!)
  await expect(actor).toHaveAttribute('data-test-action-plays', '1')
  // Returning to a tab resumes idle loops, never its already-consumed action.
  const setHidden = async (hidden: boolean): Promise<void> => {
    await page.evaluate(value => {
      Object.defineProperty(document, 'hidden', { configurable: true, value })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
    await expect(companion).toHaveAttribute('data-motion', String(!hidden))
  }
  const settleMotion = async (): Promise<void> => {
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  }
  try {
    await setHidden(true)
    await setHidden(false)
    await settleMotion()
    await expect(companion).toHaveAttribute('data-reaction-id', reaction!)
    await expect(actor).toHaveAttribute('data-test-action-plays', '1')
    // An action received while hidden still keeps its speech, without catch-up motion.
    await setHidden(true)
    await dialog.getByRole('button', { name: '↗ 做多', exact: true }).click()
    await expect(speech).toHaveAttribute('data-fish-action', 'long')
    await setHidden(false)
    await settleMotion()
    await expect(actor).toHaveAttribute('data-test-action-plays', '1')
  } finally {
    await page.evaluate(() => { Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange')) })
  }
  // System-static actions are likewise consumed rather than queued for replay.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(companion).toHaveAttribute('data-motion', 'false')
  await dialog.getByRole('button', { name: '↘ 做空', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'short')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(companion).toHaveAttribute('data-motion', 'true')
  await settleMotion()
  await expect(actor).toHaveAttribute('data-test-action-plays', '1')
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
  // Direction is only a draft: the confirmed position and water pose stay put.
  await expect(dialog.locator('.liangxiang-market-position').filter({ visible: true })).toContainText('多 10 炷')
  await expect(companion).toHaveAttribute('data-pose', 'surface')
  await dialog.getByRole('button', { name: '↗ 做多', exact: true }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'long')
  await expect(actor).toHaveAttribute('data-test-action-plays', '2')
  await dialog.getByRole('tab', { name: /P2/ }).click()
  await expect(speech).toHaveAttribute('data-fish-action', 'batch2')
  await dialog.getByRole('tab', { name: /P1/ }).click()
  const live = fixture()
  live.server_time = DAY + 13 * HOUR
  live.current_point = { ...live.current_point!, at: live.server_time }
  live.market!.batches[0] = { ...live.market!.batches[0]!, status: 'live', reference: { ...live.current_point!, at: DAY + 12 * HOUR, up_votes: 50, down_votes: 50 } }
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), live)
  const figure = dialog.locator('[data-liangxiang-market-whale-figure]')
  await expect(figure).toHaveAttribute('data-pose', 'surface')
  const parts = figure.locator('.liangxiang-market-whale-tail,.liangxiang-market-whale-hair,.liangxiang-market-whale-breath')
  await expect.poll(() => parts.evaluateAll(nodes => nodes.every(node => node.getAnimations().some(animation => animation.playState === 'running')))).toBe(true)
  const tail = parts.first(), initial = await tail.evaluate(element => getComputedStyle(element).transform)
  await expect.poll(() => tail.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial)
  expect(await figure.evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  const water = dialog.locator('.liangxiang-market-water-motion .liangxiang-market-water-back').first()
  await expect.poll(() => water.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running'))).toBe(true)
  await dialog.screenshot({ path: testInfo.outputPath('market-surface-motion.png') })
  await toggle.click()
  await expect(dialog).toHaveAttribute('data-animated', 'false')
  await expect(toggle).toContainText('大鱼干')
  await expect(companion).toHaveAttribute('data-motion', 'false')
  const fish = dialog.locator('.liangxiang-market-current-whale').first()
  expect(await fish.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  expect(await dialog.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
  await dialog.getByRole('combobox', { name: '烛线间隔' }).selectOption('60000')
  await expect(speech).toHaveAttribute('data-fish-action', 'interval')
  await expect(speech).not.toBeEmpty()
  expect(await dialog.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
  await page.evaluate(state => window.__liangxiangMarketFrame?.(state), { ...live, server_time: live.server_time + 1, current_point: { ...live.current_point!, up_votes: 45, down_votes: 55, sequence: 2 } })
  await expect(figure).toHaveAttribute('data-pose', 'dive')
  await expect(figure.locator('[data-liangxiang-market-water-occlusion]')).toHaveAttribute('data-liangxiang-market-water-occlusion', 'dive')
  await expect(figure.locator('[data-liangxiang-market-dive-bubbles] circle')).toHaveCount(3)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await dialog.screenshot({ path: testInfo.outputPath('market-dive-static.png') })
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

test('compact ticket keeps related controls together and preserves a draft between stages without spending', async ({ page }, testInfo) => {
  const dialog = await openMarket(page)
  const initialBounds = (await dialog.boundingBox())!
  const chart = dialog.locator('[data-liangxiang-market-chart-mode]')
  const initialChartBounds = (await chart.boundingBox())!
  const expectStableFrame = async (): Promise<void> => {
    const bounds = (await dialog.boundingBox())!, chartBounds = (await chart.boundingBox())!
    expect(Math.abs(bounds.height - initialBounds.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(bounds.y - initialBounds.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(chartBounds.height - initialChartBounds.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(chartBounds.y - initialChartBounds.y)).toBeLessThanOrEqual(1)
  }
  const amount = dialog.getByRole('spinbutton', { name: 'P1 总投入香火' })
  const ticket = dialog.locator('[data-liangxiang-market-batch="1"]')
  const amountLabel = ticket.locator('.liangxiang-market-amount > span').first()
  const expectUnwrappedAmountLabel = async (): Promise<void> => {
    expect(await amountLabel.evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getClientRects().length
    })).toBe(1)
  }
  await expectUnwrappedAmountLabel()
  if (testInfo.project.name === 'chromium-desktop') {
    const viewport = page.viewportSize()!
    try {
      await page.setViewportSize({ width: 662, height: 820 })
      await expectUnwrappedAmountLabel()
    } finally { await page.setViewportSize(viewport) }
  }
  if (testInfo.project.name !== 'chromium-narrow') {
    const orderBounds = await ticket.locator('.liangxiang-market-direction,.liangxiang-market-amount,.liangxiang-market-primary').evaluateAll(nodes => nodes.map(node => {
      const { top, bottom, left, right } = node.getBoundingClientRect()
      return { top, bottom, left, right }
    }))
    expect(Math.max(...orderBounds.map(item => item.top))).toBeLessThan(Math.min(...orderBounds.map(item => item.bottom)))
    for (let index = 1; index < orderBounds.length; index++) expect(orderBounds[index]!.left).toBeGreaterThanOrEqual(orderBounds[index - 1]!.right)
  }
  await amount.fill('17')
  await expect(dialog.getByRole('tabpanel')).toHaveCount(1)
  await dialog.getByRole('tab', { name: /P2/ }).click()
  await expect(dialog.getByRole('tabpanel')).toHaveCount(1)
  await expect(dialog.getByRole('spinbutton')).toBeDisabled()
  await expectStableFrame()
  await dialog.getByRole('tab', { name: /P1/ }).click()
  await expect(amount).toHaveValue('17')
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await page.keyboard.press('End')
  await expect(dialog.getByRole('tab', { name: /P3/ })).toHaveAttribute('aria-selected', 'true')
  await expectStableFrame()
  await page.keyboard.press('Home')
  await expect(dialog.getByRole('tab', { name: /P1/ })).toHaveAttribute('aria-selected', 'true')
  await expectStableFrame()
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test('tide uses smooth real anchors over the full day, leaves gaps and future open and retains candles', async ({ page }, testInfo) => {
  const data = candles().filter((_candle, index) => index < 240 || index >= 300)
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: candlePage(route.request().url(), data) }))
  const dialog = await openMarket(page), chart = dialog.locator('[data-liangxiang-market-chart-mode]')
  await expect(chart).toHaveAttribute('data-liangxiang-market-chart-mode', 'candles')
  for (const key of ['open', 'high', 'low', 'close']) {
    await expect(chart.locator(`[data-liangxiang-market-quote="${key}"]`)).toBeVisible()
  }
  const candleCount = await chart.locator('[data-liangxiang-market-candle]').count()
  expect(candleCount).toBeGreaterThan(0)
  expect(candleCount).toBeLessThan(data.length)
  await chart.getByRole('button', { name: '潮汐', exact: true }).click()
  await expect(chart).toHaveAttribute('data-liangxiang-market-chart-mode', 'tide')
  const segments = chart.locator('[data-liangxiang-market-tide-segment]')
  await expect(segments).toHaveCount(2)
  const geometry = await segments.evaluateAll(nodes => nodes.map(node => ({ path: node.getAttribute('d'), x: (node as SVGGraphicsElement).getBBox().x, width: (node as SVGGraphicsElement).getBBox().width })))
  expect(geometry[0]!.x + geometry[0]!.width).toBeLessThan(geometry[1]!.x)
  expect(geometry.every(segment => /C/.test(segment.path ?? '') && !/[HV]/.test(segment.path ?? ''))).toBe(true)
  const svg = chart.locator('svg').first()
  await expect(svg).toHaveAttribute('data-liangxiang-market-from', String(DAY))
  await expect(svg).toHaveAttribute('data-liangxiang-market-until', String(DAY + 24 * HOUR))
  const tickLabels = chart.locator('.liangxiang-market-time-tick text')
  await expect(tickLabels).toHaveText((await svg.boundingBox())!.width >= 500
    ? ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00']
    : ['00:00', '08:00', '16:00', '24:00'])
  const future = chart.locator('[data-liangxiang-market-future]')
  await expect(future).toContainText('待打梁')
  const futureX = Number(await future.locator('rect').getAttribute('x'))
  expect(geometry.every(segment => segment.x + segment.width <= futureX + .02)).toBe(true)
  await future.locator('rect').hover({ position: { x: 90, y: 80 } })
  await expect(chart.locator('.liangxiang-market-chart-readout')).toContainText('待打梁')
  const volume = chart.locator('[data-liangxiang-market-volume]')
  expect(await volume.count()).toBeGreaterThan(0)
  await volume.first().hover()
  await expect(chart.locator('.liangxiang-market-chart-readout')).toContainText('本场新增')
  await expect(chart.locator('.liangxiang-market-chart-readout')).not.toContainText('全网')
  expect(await volume.evaluateAll(nodes => nodes.every(node => node.getAnimations().length === 0))).toBe(true)
  await expect(chart).not.toContainText('气泡 =')
  await chart.screenshot({ path: testInfo.outputPath('market-tide.png') })
  await chart.getByRole('button', { name: 'K 线', exact: true }).click()
  await expect(chart).toHaveAttribute('data-liangxiang-market-chart-mode', 'candles')
  await expect(chart.locator('[data-liangxiang-market-tide-segment]')).toHaveCount(0)
  await expect(chart.locator('[data-liangxiang-market-candle]')).toHaveCount(candleCount)
  await chart.getByRole('button', { name: '潮汐', exact: true }).click()
  await expect(segments).toHaveCount(2)
})


test('raised direction buttons depress and rebound without spending incense', async ({ page }, testInfo) => {
  const dialog = await openMarket(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await dialog.getByRole('switch', { name: '交易动画' }).click()
  const button = dialog.getByRole('button', { name: '↘ 做空' }), face = button.locator('.liangxiang-market-button-face')
  const rest = await face.evaluate(element => getComputedStyle(element).transform)
  const bounds = (await button.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await expect.poll(() => face.evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)).toBe(0)
  await dialog.screenshot({ path: testInfo.outputPath('market-button-pressed.png') })
  await page.mouse.up()
  await expect.poll(() => face.evaluate(element => getComputedStyle(element).transform)).toBe(rest)
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
})


test('one market entry replaces the separate observed-bars entry without changing the wallet', async ({ page }) => {
  const market = await openMarket(page)
  await page.keyboard.press('Escape')
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-utility-trigger]').click()
  const entry = panel.locator('[data-liangxiang-utility-market]')
  await expect(entry).toBeVisible()
  const tileBounds = (await panel.locator('[data-liangxiang-utility-action="home"]').boundingBox())!
  const entryBounds = (await entry.boundingBox())!
  expect(entryBounds.height).toBeGreaterThan(tileBounds.height)
  await expect(entry.locator('[data-liangxiang-utility-icon="market"]')).toHaveAttribute('aria-hidden', 'true')
  await expect(panel.locator('[data-liangxiang-utility-action="bars"]')).toHaveCount(0)
  await panel.locator('[data-liangxiang-utility-market]').click()
  await expect(market).toBeVisible()
  await expect(page.getByRole('dialog', { name: '梁位走势', exact: true })).toHaveCount(0)
  await expect(market.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(market.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
})

test('receipt and rules remain visible controls and use overlays without shifting the market', async ({ page }) => {
  const dialog = await openMarket(page)
  const bounds = (await dialog.boundingBox())!
  for (const [name, kind] of [['我的回执', 'history'], ['玩法', 'rules']] as const) {
    const trigger = dialog.getByRole('button', { name, exact: true })
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(dialog.locator(`[data-liangxiang-market-popover="${kind}"]`)).toBeVisible()
    const opened = (await dialog.boundingBox())!
    expect(Math.abs(opened.height - bounds.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(opened.y - bounds.y)).toBeLessThanOrEqual(1)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }
  await expect(dialog.locator('[data-liangxiang-market-available]')).toHaveText('90')
  await expect(dialog.locator('[data-liangxiang-market-frozen]')).toHaveText('10')
})
