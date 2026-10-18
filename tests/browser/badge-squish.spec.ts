import { expect, test, type Page } from '@playwright/test'
import { badgeSelector, bootInstalledLiangxiang, panelSelector } from './helpers.ts'
import { SQUISH_LABELS } from '../../src/client/badge-squish.ts'

const tooltipSelector = '[data-liangxiang-badge-tooltip]'
const speechSelector = '[data-liangxiang-danmu]'
const activeRows = '[data-liangxiang-danmu-row][data-exiting="false"]'
const activeLines = `${activeRows} [data-liangxiang-danmu-line]`

async function dragBadge(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator(badgeSelector).boundingBox())!
  if (Math.abs(box.x - x) + Math.abs(box.y - y) < 1) return
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(x + 24, y + 24, { steps: 8 })
  await page.mouse.up()
}

async function assertSpeechFits(page: Page): Promise<void> {
  const panel = (await page.locator(panelSelector).boundingBox())!
  const badge = (await page.locator(badgeSelector).boundingBox())!
  const speech = (await page.locator(speechSelector).boundingBox())!
  const viewport = page.viewportSize()!
  expect(speech.x).toBeGreaterThanOrEqual(panel.x - 1)
  expect(speech.x + speech.width).toBeLessThanOrEqual(panel.x + panel.width + 1)
  expect(speech.y).toBeGreaterThanOrEqual(7)
  expect(speech.y + speech.height).toBeLessThanOrEqual(viewport.height - 7)
  if (panel.y < badge.y) {
    expect(speech.y).toBeGreaterThanOrEqual(panel.y + panel.height + 5)
    expect(speech.y + speech.height).toBeLessThanOrEqual(badge.y + badge.height + 1)
  }
  else expect(speech.y + speech.height).toBeLessThanOrEqual(panel.y - 5)
  for (const line of await page.locator(activeLines).all()) {
    const box = (await line.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(speech.x)
    expect(box.x + box.width).toBeLessThanOrEqual(speech.x + speech.width)
    expect(box.y + box.height).toBeLessThanOrEqual(speech.y + speech.height)
  }
}

test('the entry opens within a frame budget, repeated taps never toggle, and dismissal is immediate', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const badge = page.locator(badgeSelector)
  const panel = page.locator(panelSelector)
  const gameplay: string[] = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST' && /\/api\/(?:vote|mode|reconcile|dev\/credit|local\/cycle-case)$/.test(path)) gameplay.push(path)
  })
  await badge.evaluate(element => {
    const changes: Array<{ open: string | null, delay: number }> = []
    let activated = 0
    Object.assign(window, { badgePanelChanges: changes })
    element.closest('[data-liangxiang-root]')!.addEventListener('click', () => { activated = performance.now() }, true)
    new MutationObserver(() => changes.push({ open: element.getAttribute('aria-expanded'), delay: performance.now() - activated }))
      .observe(element, { attributes: true, attributeFilter: ['aria-expanded'] })
  })
  await badge.click()
  await expect(panel).toBeVisible()
  let changes = await page.evaluate(() => Reflect.get(window, 'badgePanelChanges'))
  expect(changes).toHaveLength(1)
  expect(changes[0].open).toBe('true')
  expect(changes[0].delay).toBeLessThan(100)
  for (const delay of [50, 180, 50]) {
    await badge.dblclick({ delay, force: true })
    await expect(panel).toBeVisible()
    await page.waitForTimeout(850)
  }
  expect(await page.evaluate(() => Reflect.get(window, 'badgePanelChanges').length)).toBe(1)
  await panel.getByRole('button', { name: '关闭面板', exact: true }).click()
  await expect(panel).toBeHidden()
  changes = await page.evaluate(() => Reflect.get(window, 'badgePanelChanges'))
  expect(changes[1].open).toBe('false')
  expect(changes[1].delay).toBeLessThan(100)
  await badge.dblclick({ delay: 50 })
  await expect(panel).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, 'badgePanelChanges').map((change: { open: string }) => change.open))).toEqual(['true', 'false', 'true'])
  expect(gameplay).toEqual([])
})

test('displaced speech fades while present, expires through the same exit, and then restores hover', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const badge = page.locator(badgeSelector)
  const tooltip = page.locator(tooltipSelector)
  await badge.hover()
  await expect.poll(() => tooltip.evaluate(el => getComputedStyle(el).opacity)).toBe('1')
  await badge.click()
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(160); await badge.click({ force: true }) }
  await expect(page.locator(activeRows)).toHaveCount(3)
  for (const text of await page.locator(activeLines).allTextContents()) expect(SQUISH_LABELS).toContain(text)
  const oldest = await page.locator(activeRows).last().getAttribute('data-liangxiang-danmu-row')
  const retiring = page.locator(`[data-liangxiang-danmu-row="${oldest}"]`)
  await page.waitForTimeout(160)
  await badge.click({ force: true })
  await expect(retiring).toHaveAttribute('data-exiting', 'true')
  await page.waitForTimeout(70)
  const opacity = await retiring.evaluate(el => Number(getComputedStyle(el).opacity))
  expect(opacity).toBeGreaterThan(0)
  expect(opacity).toBeLessThan(1)
  await expect(retiring).toHaveCount(0)
  await expect(page.locator(activeRows)).toHaveCount(3)
  await assertSpeechFits(page)
  await expect.poll(() => tooltip.evaluate(el => getComputedStyle(el).opacity)).toBe('0')
  await expect(page.locator(speechSelector)).toHaveCount(0, { timeout: 4_000 })
  await expect.poll(() => tooltip.evaluate(el => getComputedStyle(el).opacity)).toBe('1')
  await expect(page.locator(panelSelector)).toBeVisible()
})

test('ordinary hover still centers when possible and clamps only at actual edges', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const width = page.viewportSize()!.width
  const badge = page.locator(badgeSelector)
  const tooltip = page.locator(tooltipSelector)
  for (const [x, align] of [[12, 'start'], [width < 1024 ? 300 : 60, 'center'], [width - 108, 'center'], [width - 60, 'end']] as const) {
    await dragBadge(page, x, 420)
    await badge.hover()
    await expect(tooltip).toHaveAttribute('data-align', align)
    await expect.poll(() => tooltip.evaluate(el => getComputedStyle(el).opacity)).toBe('1')
    const box = (await tooltip.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(7)
    expect(box.x + box.width).toBeLessThanOrEqual(width - 7)
    if (align === 'center') {
      const anchor = (await badge.boundingBox())!
      expect(Math.abs(box.x + box.width / 2 - anchor.x - anchor.width / 2)).toBeLessThan(1)
    }
  }
})

test('one connected speech surface stays within the panel column at every dock', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const badge = page.locator(badgeSelector)
  const viewport = page.viewportSize()!
  await badge.press('Enter')
  for (const [x, y] of [[12, viewport.height - 98], [viewport.width - 60, 12], [12, viewport.height - 60], [viewport.width / 2, 420]]) {
    await dragBadge(page, x!, y!)
    for (let i = 0; i < 3; i++) { await page.waitForTimeout(160); await badge.click({ force: true }) }
    await page.waitForTimeout(230)
    await expect(page.locator(speechSelector)).toHaveCount(1)
    await assertSpeechFits(page)
    expect(await page.locator(activeRows).count()).toBeLessThanOrEqual(3)
    await expect(page.locator(panelSelector)).toBeVisible()
  }
  await page.screenshot({ path: test.info().outputPath('badge-speech.png') })
})

test('all live speech remains readable and opaque in the installed theme', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const badge = page.locator(badgeSelector)
  await badge.click()
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(160); await badge.click() }
  await expect(page.locator(activeRows)).toHaveCount(3)
  const ratios = await page.locator(speechSelector).evaluate(element => {
    const ctx = document.createElement('canvas').getContext('2d')!
    const rgb = (color: string): number[] => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const luminance = (values: number[]): number => values.map(v => {
      const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4
    }).reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index]!, 0)
    const bg = luminance(rgb(getComputedStyle(element).backgroundColor))
    return [...element.querySelectorAll('[data-exiting="false"]')].map(row => {
      const line = row.querySelector('[data-liangxiang-danmu-line]')!
      const fg = luminance(rgb(getComputedStyle(line).color))
      return { contrast: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05), opacity: getComputedStyle(row).opacity }
    })
  })
  for (const row of ratios) { expect(row.contrast).toBeGreaterThanOrEqual(4.5); expect(row.opacity).toBe('1') }
})

test('the whole badge rebounds and sounds only for a confirmed tap, never a drag', async ({ page }) => {
  await page.addInitScript(() => {
    const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }
    Object.defineProperty(window, 'AudioContext', { value: class {
      currentTime = 0; state = 'running'; destination = {}
      createOscillator() {
        return { frequency: parameter, connect() {}, stop() {}, start() {
          const root = document.documentElement
          root.dataset.liangxiangTestTones = String(Number(root.dataset.liangxiangTestTones ?? 0) + 1)
        } }
      }
      createGain() { return { gain: parameter, connect() {} } }
    } })
  })
  await bootInstalledLiangxiang(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const badge = page.locator(badgeSelector)
  const tones = () => page.evaluate(() => Number(document.documentElement.dataset.liangxiangTestTones ?? 0))
  const before = await tones()
  const box = (await badge.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect.poll(() => badge.evaluate(el => getComputedStyle(el).transform)).not.toBe('none')
  await page.mouse.move(box.x + 130, box.y - 70, { steps: 8 })
  await page.mouse.up()
  await expect(badge).not.toHaveAttribute('data-squish-release')
  await expect(page.locator(panelSelector)).toBeHidden()
  expect(await tones()).toBe(before)
  await badge.click()
  await expect(badge).toHaveAttribute('data-squish-release', 'true')
  await expect(page.locator(panelSelector)).toBeVisible()
  expect(await tones()).toBe(before + 1)
  await expect(badge).not.toHaveAttribute('data-squish-release', { timeout: 2_000 })
})

test('cancel stays quiet; keyboard is immediate and reduced motion keeps speech still', async ({ page }) => {
  await bootInstalledLiangxiang(page)
  const badge = page.locator(badgeSelector)
  const box = (await badge.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await page.mouse.up()
  await expect(badge).not.toHaveAttribute('data-squish-pressed')
  await expect(badge).not.toHaveAttribute('data-squish-release')
  await expect(page.locator(panelSelector)).toBeHidden()
  await badge.press('Enter')
  await expect(page.locator(panelSelector)).toBeVisible()
  await badge.press('Space')
  await expect(page.locator(panelSelector)).toBeVisible()
  await expect(page.locator(speechSelector)).toHaveCount(0)
  await badge.click()
  await expect(page.locator(speechSelector)).toBeVisible()
  expect(await badge.evaluate(el => getComputedStyle(el).transform)).toBe('none')
  expect(await badge.evaluate(el => el.getAnimations().length)).toBe(0)
  expect(await page.locator('[data-liangxiang-feedback]').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
  await page.locator(panelSelector).press('Escape')
  await expect(page.locator(panelSelector)).toBeHidden()
  await expect(page.locator(speechSelector)).toHaveCount(0)
})
