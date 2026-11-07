import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import type { MarketCandle, MarketState } from '../../src/shared/market-v1.ts'
import { axeSummary, bootInstalledLiangxiang, openPanel } from './helpers.ts'

const DAY = Date.UTC(2026, 10, 6), HOUR = 3_600_000

function chartFixture(): MarketState {
  const schedule = [[9, 11, 12], [12, 17, 18], [18, 20, 21]] as const
  return {
    schema_version: 1, soft_trust: true, server_time: DAY + 10 * HOUR,
    wallet: { available_incense: 90, frozen_incense: 10, total_incense: 100, token_remainder: 12_000, token_per_incense: 50_000, version: 1 },
    current_point: { case_id: 'case-chart-browser', at: DAY + 10 * HOUR, up_votes: 55, down_votes: 45, sequence: 1 },
    market: {
      id: 'market-chart-browser', case_id: 'case-chart-browser', business_date: '2026-11-06', timezone: 'UTC',
      rule_version: 'liangxiang-market-v1', opens_at: DAY + 9 * HOUR, closes_at: DAY + 24 * HOUR,
      status: 'open', close_point: null,
      batches: schedule.map(([open, lock, reference], index) => ({
        batch: (index + 1) as 1 | 2 | 3, opens_at: DAY + open * HOUR, locks_at: DAY + lock * HOUR,
        reference_at: DAY + reference * HOUR, status: index === 0 ? 'open' : 'pending', reference: null,
        long_incense: index === 0 ? 30 : 0, short_incense: index === 0 ? 20 : 0,
        position: index === 0 ? { side: 'long', amount: 10, submitted_at: DAY + 9 * HOUR, payout: null } : null,
        result: null,
      })),
    },
  }
}

function chartCandles(): MarketCandle[] {
  return Array.from({ length: 120 }, (_, index) => {
    const open = .49 + Math.sin(index / 8) * .035, close = .49 + Math.sin((index + 1) / 8) * .035
    return { at: DAY + index * 300_000, open, close, high: Math.max(open, close) + .004, low: Math.min(open, close) - .004, up_votes: 50 + index, down_votes: 50 + index, volume: 2 }
  })
}

async function openChart(page: Page) {
  const panel = await openPanel(page)
  await panel.locator('[data-liangxiang-utility-trigger]').click()
  await expect(panel.locator('[data-liangxiang-utility-action="bars"]')).toHaveCount(0)
  await panel.locator('[data-liangxiang-utility-market]').click()
  const dialog = page.getByRole('dialog', { name: '香火交易', exact: true })
  await expect(dialog).toBeVisible()
  const chart = dialog.locator('[data-liangxiang-market-chart-mode]')
  await expect(chart).toHaveAttribute('data-liangxiang-market-chart-mode', 'candles')
  await expect(chart.locator('[data-liangxiang-market-candle]').first()).toBeVisible()
  return { dialog, chart }
}

test.beforeEach(async ({ page }) => {
  // Exercise the real packed UI with deterministic official candle fixtures.
  // Presentation tests never submit a position or contact a community node.
  await page.addInitScript(() => {
    const Native = window.EventSource
    window.EventSource = new Proxy(Native, {
      construct(target, args) {
        const path = new URL(String(args[0]), location.href).pathname
        if (path !== '/liangxiang/api/events' && path !== '/liangxiang/api/market/events') return Reflect.construct(target, args)
        return { onmessage: null, onerror: null, close() {} }
      },
    })
  })
  await page.route(/\/liangxiang\/api\/(?:state|refresh)(?:\?|$)/, async route => {
    const response = await route.fetch(), wire = await response.json() as Record<string, unknown>
    await route.fulfill({ response, json: { ...wire, authorityMode: 'DEV_STAGING_ONLY', authorityAvailable: true } })
  })
  const state = chartFixture()
  await page.route('**/liangxiang/api/market', route => route.fulfill({ json: state, headers: { 'x-liangxiang-cache-scope': 'browser-chart-scope' } }))
  await page.route('**/liangxiang/api/market/candles?*', route => route.fulfill({ json: { schema_version: 1, case_id: state.market!.case_id, business_date: state.market!.business_date, interval_ms: 300_000, candles: chartCandles(), next_cursor: null } }))
  await page.route('**/liangxiang/api/market/history?*', route => route.fulfill({ json: { schema_version: 1, receipts: [], next_cursor: null }, headers: { 'x-liangxiang-cache-scope': 'browser-chart-scope' } }))
  await bootInstalledLiangxiang(page)
})

test('unified K line has numeric axes, separate OHLC, keyboard reading and reversible zoom', async ({ page }, testInfo) => {
  const { dialog, chart } = await openChart(page)
  const svg = chart.locator('svg[data-liangxiang-market-from]')
  await expect(svg).toHaveAttribute('data-liangxiang-market-from', String(DAY))
  await expect(svg).toHaveAttribute('data-liangxiang-market-until', String(DAY + 24 * HOUR))
  const priceAxis = chart.locator('[data-liangxiang-market-price-axis]')
  await expect(priceAxis).toHaveCount(5)
  await expect(priceAxis.first()).toBeVisible()
  for (const label of await priceAxis.locator('text').allTextContents()) expect(label).toMatch(/^\d+\.\d+%$/)

  const toolbar = chart.locator('.liangxiang-market-chart-toolbar')
  const controls = toolbar.locator('button,.liangxiang-market-chart-interval')
  const controlBounds = await controls.evaluateAll(nodes => nodes.map(node => {
    const { x, y, width, height } = node.getBoundingClientRect()
    return { x, y, width, height }
  }))
  const expectStableControls = async (): Promise<void> => {
    const next = await controls.evaluateAll(nodes => nodes.map(node => {
      const { x, y, width, height } = node.getBoundingClientRect()
      return { x, y, width, height }
    }))
    expect(next).toHaveLength(controlBounds.length)
    for (let i = 0; i < next.length; i++) for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(next[i]![key] - controlBounds[i]![key])).toBeLessThanOrEqual(1)
    }
  }
  await toolbar.getByRole('button', { name: '近4时', exact: true }).click()
  await expect(toolbar.locator('.liangxiang-market-chart-interval')).toHaveText('5分钟')
  await expectStableControls()
  await toolbar.getByRole('button', { name: '今日', exact: true }).click()
  await expect(toolbar.locator('.liangxiang-market-chart-interval')).toHaveText(/^(15|30)分钟$/)
  await expectStableControls()
  await expect(chart.locator('[data-liangxiang-market-phase="before"]')).toHaveCount(1)
  await expect(chart.locator('[data-liangxiang-market-phase="open"]')).toHaveCount(3)
  await expect(chart.locator('[data-liangxiang-market-phase="locked"]')).toHaveCount(3)
  await expect(chart.locator('[data-liangxiang-market-phase="closing"]')).toHaveCount(1)
  await expect(chart.locator('[data-liangxiang-market-future]')).toContainText('待打梁')

  const quoteBounds = []
  for (const key of ['open', 'high', 'low', 'close']) {
    const quote = chart.locator(`[data-liangxiang-market-quote="${key}"]`)
    await expect(quote).toContainText('%')
    quoteBounds.push((await quote.boundingBox())!)
  }
  for (let i = 1; i < quoteBounds.length; i++) {
    expect(quoteBounds[i]!.x).toBeGreaterThanOrEqual(quoteBounds[i - 1]!.x + quoteBounds[i - 1]!.width)
  }
  const readout = chart.locator('.liangxiang-market-chart-readout')
  const initialReadout = await readout.innerText()
  await svg.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(readout).not.toHaveText(initialReadout)
  await expect(svg).toBeFocused()
  const priceBox = (await svg.boundingBox())!
  await svg.click({ position: { x: priceBox.width * .25, y: 50 } })
  await expect(svg).toHaveAttribute('data-liangxiang-market-pinned', 'true')
  await page.keyboard.press('Escape')
  await expect(svg).toHaveAttribute('data-liangxiang-market-pinned', 'false')
  await expect(dialog).toBeVisible()

  const domainSpan = async (): Promise<number> => Number(await svg.getAttribute('data-liangxiang-market-until')) - Number(await svg.getAttribute('data-liangxiang-market-from'))
  const fullDay = await domainSpan()
  await chart.getByRole('button', { name: '放大走势', exact: true }).click()
  const zoomed = await domainSpan()
  expect(zoomed).toBeLessThan(fullDay)
  await chart.getByRole('button', { name: '缩小走势', exact: true }).click()
  expect(await domainSpan()).toBeGreaterThan(zoomed)

  await expect(dialog).toHaveAttribute('data-fullscreen', 'false')
  const floatingBounds = (await dialog.boundingBox())!
  await dialog.getByRole('button', { name: '全屏香火交易', exact: true }).click()
  await expect(dialog).toHaveAttribute('data-fullscreen', 'true')
  const fullBounds = (await dialog.boundingBox())!
  expect(fullBounds.width).toBeGreaterThanOrEqual(floatingBounds.width)
  expect(fullBounds.height).toBeGreaterThanOrEqual(floatingBounds.height)
  expect(await chart.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await dialog.getByRole('button', { name: '退出全屏香火交易', exact: true }).click()
  await expect(dialog).toHaveAttribute('data-fullscreen', 'false')
  expect(Math.abs((await dialog.boundingBox())!.height - floatingBounds.height)).toBeLessThanOrEqual(1)

  expect(await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
      && element.scrollWidth <= element.clientWidth
  })).toBe(true)

  if (testInfo.project.name === 'chromium-narrow') {
    const previousViewport = page.viewportSize()!
    try {
      await page.setViewportSize({ width: 320, height: 800 })
      await expect.poll(() => chart.locator('svg[data-liangxiang-market-from]').evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(320)
      const edgeChecks = await dialog.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return [...element.querySelectorAll<HTMLElement>('.liangxiang-market-header button,.liangxiang-market-wallet,.liangxiang-market-header-caption,.liangxiang-market-chart-toolbar button,.liangxiang-market-chart-interval,[data-liangxiang-market-quote],[data-liangxiang-market-main-whale]')].map(node => {
          const rect = node.getBoundingClientRect()
          return { label: node.getAttribute('aria-label') ?? node.textContent ?? node.tagName, fits: rect.left >= bounds.left && rect.right <= bounds.right + 1 }
        })
      })
      expect(edgeChecks.filter(check => !check.fits)).toEqual([])
      const fish = (await dialog.locator('[data-liangxiang-market-main-whale]').boundingBox())!
      const caption = (await dialog.locator('.liangxiang-market-header-caption').boundingBox())!
      const reply = (await dialog.locator('.liangxiang-market-fish-reply').boundingBox())!
      expect(fish.x >= caption.x + caption.width || caption.x >= fish.x + fish.width
        || fish.y >= caption.y + caption.height || caption.y >= fish.y + fish.height).toBe(true)
      expect(reply.y + reply.height).toBeLessThanOrEqual(fish.y + 1)
      const overflow = await dialog.evaluate(element => [element,
        ...element.querySelectorAll('.liangxiang-market-chart-toolbar,.liangxiang-market-chart-scroll,.liangxiang-market-stage:not([hidden])')]
        .map(node => ({ name: node.className, overflows: node.scrollWidth > node.clientWidth + 1 })))
      expect(overflow.filter(item => item.overflows)).toEqual([])
      await dialog.getByRole('button', { name: '玩法', exact: true }).click()
      const rules = dialog.locator('[data-liangxiang-market-popover="rules"]')
      await expect(rules).toBeVisible()
      expect(await rules.evaluate(element => {
        const rect = element.getBoundingClientRect(), parent = element.closest('[data-liangxiang-market-dialog]')!.getBoundingClientRect()
        return element.scrollWidth <= element.clientWidth + 1 && rect.left >= parent.left && rect.right <= parent.right + 1
      })).toBe(true)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible()
    } finally {
      await page.setViewportSize(previousViewport)
    }
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('[data-liangxiang-utility-trigger]')).toBeFocused()
})

test('unified chart and wallet have no WCAG A/AA axe violations', async ({ page }) => {
  await openChart(page)
  const results = await new AxeBuilder({ page })
    .include('[data-liangxiang-market-dialog]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations, axeSummary(results.violations)).toEqual([])
})

test('legacy full-screen preferences cannot restore a second chart on reload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('liangxiang:bars:v1', JSON.stringify({ slot: 'full', range: 'today', x: null, y: null }))
  })
  await page.reload()
  await expect(page.locator('[data-liangxiang-bars-window]')).toHaveCount(0)
  const onboarding = page.getByRole('dialog', { name: /^(?:Get started|Add an API key to get started)$/ })
  const appeared = await onboarding.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)
  if (appeared) {
    await onboarding.getByRole('button', { name: /^(?:Close|Configure later)$/ }).click()
    await expect(onboarding).toBeHidden()
  }
  const { dialog } = await openChart(page)
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('[data-liangxiang-utility-trigger]')).toBeFocused()
})
