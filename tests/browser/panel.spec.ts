import { expect, test } from '@playwright/test'
import { RELEASE_NOTES_TITLE } from '../../src/client/release-notes.ts'
import { DEFAULT_INCENSE_WEIGHT_POLICY } from '../../src/domain/index.ts'
import { parseWireState } from '../../src/shared/wire.ts'
import { wireToViewState } from '../../src/client/store.ts'

import {
  badgeSelector,
  bootInstalledLiangxiang,
  liangciSelector,
  openPanel,
  panelSelector,
  waitForSettledAnimations,
} from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await bootInstalledLiangxiang(page)
})

test('packed install exposes the frozen four-region panel and exactly two vote actions', async ({ page }) => {
  const badge = page.locator(badgeSelector)
  await badge.focus()
  await badge.press('Enter')

  const panel = page.locator(panelSelector)
  await expect(panel).toBeVisible()
  await expect(panel).toBeFocused()
  await expect(panel).toHaveAttribute('data-liangxiang-authority', /^(DEV_STAGING_ONLY|LOCAL_FAKE_DEV)$/)

  const regions = panel.locator('[data-liangxiang-region]')
  await expect(regions).toHaveCount(4)
  await expect(regions.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-liangxiang-region'))))
    .resolves.toEqual(['case', 'core', 'vote', 'social'])

  await expect(panel.locator('[data-liangxiang-case-title]')).toBeVisible()
  const votes = panel.locator('[data-liangxiang-vote]')
  await expect(votes).toHaveCount(2)
  await expect(votes.nth(0)).toHaveAttribute('data-liangxiang-vote', 'up')
  await expect(votes.nth(0)).toContainText('夯 · 升梁')
  await expect(votes.nth(1)).toHaveAttribute('data-liangxiang-vote', 'down')
  await expect(votes.nth(1)).toContainText('拉 · 降梁')
})

test('keyboard opens and closes the panel and returns focus to 今日梁相', async ({ page }) => {
  const badge = page.locator(badgeSelector)
  const panel = page.locator(panelSelector)

  await badge.focus()
  await badge.press('Enter')
  await expect(panel).toBeVisible()
  await expect(panel).toBeFocused()

  await panel.press('Escape')
  await expect(panel).toBeHidden()
  await expect(badge).toBeFocused()
  await expect(badge).toHaveAttribute('aria-expanded', 'false')

  await badge.press('Space')
  await expect(panel).toBeVisible()
  await expect(panel).toBeFocused()
})

test('梁小号 stays visible without a clickable explanation or keyboard stop', async ({ page }) => {
  const panel = await openPanel(page)
  const epithet = panel.locator('[data-liangxiang-epithet]')
  await expect(epithet).toContainText('梁小号：')
  await expect(epithet).toHaveAttribute('role', 'status')
  expect(await epithet.getAttribute('title')).toBeNull()
  expect(await epithet.getAttribute('tabindex')).toBeNull()
  await epithet.hover()
  await epithet.click()
  await expect(epithet).toContainText('梁小号：')
  await expect(panel.locator('[data-liangxiang-epithet-hint]')).toHaveCount(0)
  expect(await epithet.getAttribute('data-open')).toBeNull()
})

test('next-incense stays passive without a model tooltip while exact Host amounts remain readable', async ({ page }) => {
  const panel = await openPanel(page)
  const response = await page.request.get('/liangxiang/api/state')
  expect(response.ok()).toBe(true)
  const wire = parseWireState(await response.json())
  expect(wire.incenseWeightPolicy).toEqual(DEFAULT_INCENSE_WEIGHT_POLICY)
  const next = panel.locator('[data-liangxiang-personal="next-incense"]')
  expect(await next.getAttribute('tabindex')).toBeNull()
  const exact = wireToViewState(wire, 'live').personal.tokensToNextIncense.toLocaleString('zh-CN')
  await expect(next).toHaveAttribute('aria-label', `下一炷 ${exact} 当量`)
  expect(await next.locator('[data-liangxiang-compact="next-incense"]').getAttribute('title')).toBeNull()
  await next.hover()
  await expect(panel.locator('[data-liangxiang-weight-hint]')).toHaveCount(0)
  await expect(panel.getByRole('table', { name: '凝香规则' })).toHaveCount(0)
  await expect(panel).toContainText(`距下一炷还差 ${exact} 当量`)
})

test('fresh default dock sits just above the visible DSH footer control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-narrow', 'DSH collapses the settings control outside the narrow frame')
  const badgeBox = await page.locator(badgeSelector).boundingBox()
  const settingsBox = await page.getByRole('button', { name: /^(?:Settings|设置|Account menu|账户菜单)$/ }).boundingBox()

  expect(badgeBox).not.toBeNull()
  expect(settingsBox).not.toBeNull()
  if (badgeBox === null || settingsBox === null) return
  expect(Math.round(settingsBox.y - (badgeBox.y + badgeBox.height))).toBe(8)
})

test('pointer crosses from 梁相案牍 into its menu and version reopens update notes', async ({ page }) => {
  const panel = await openPanel(page)
  const trigger = panel.locator('[data-liangxiang-utility-trigger]')
  await trigger.click()

  const drawer = panel.locator('[data-liangxiang-utility-drawer]')
  await expect(drawer).toBeVisible()

  const triggerBox = await trigger.boundingBox()
  const drawerBox = await drawer.boundingBox()
  expect(triggerBox).not.toBeNull()
  expect(drawerBox).not.toBeNull()
  if (triggerBox === null || drawerBox === null) return

  // The bridge covers the full outer drawer width, including its padding.
  await page.mouse.move(drawerBox.x + 2, (drawerBox.y + drawerBox.height + triggerBox.y) / 2)
  await page.waitForTimeout(220)
  await expect(drawer).toBeVisible()

  // Cross the visual 6px gap explicitly. The transparent descendant bridge
  // keeps this point inside the combined trigger + drawer hover region.
  await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2)
  await page.mouse.move(
    triggerBox.x + triggerBox.width / 2,
    (drawerBox.y + drawerBox.height + triggerBox.y) / 2,
  )
  await expect(drawer).toBeVisible()

  const version = drawer.locator('[data-liangxiang-utility-action="version"]')
  const versionLayout = await version.evaluate(button => {
    const box = button.getBoundingClientRect()
    const label = button.querySelector('[data-liangxiang-version-label]')!
    const group = label.getBoundingClientRect()
    const lines = [...label.children].map(line => line.getBoundingClientRect())
    return { fits: button.scrollWidth <= button.clientWidth && lines.every(line => line.left >= box.left && line.right <= box.right),
      leftAligned: lines.every(line => Math.abs(line.left - group.left) < 1),
      verticalOffset: Math.abs((group.top + group.bottom) / 2 - (box.top + box.bottom) / 2) }
  })
  expect(versionLayout.fits).toBe(true)
  expect(versionLayout.leftAligned).toBe(true)
  expect(versionLayout.verticalOffset).toBeLessThan(1)
  await version.hover()
  await expect(drawer).toBeVisible()
  await version.click()

  const releaseNotes = page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })
  await expect(releaseNotes).toBeVisible()
  await expect(releaseNotes.locator('[data-liangxiang-release-notes-qq-qrcode]')).toBeVisible()
  await expect(page.locator('[data-liangxiang-version-dialog]')).toHaveCount(0)
})

test('utility hover closes after pointer exit despite click focus, cancels on return, and keeps confirmation controls usable', async ({ page }) => {
  const panel = await openPanel(page)
  const trigger = panel.locator('[data-liangxiang-utility-trigger]')
  const drawer = panel.locator('[data-liangxiang-utility-drawer]')
  const outside = panel.locator('[data-liangxiang-case-title]')
  const out = (await outside.boundingBox())!
  await trigger.click()
  await expect(drawer).toBeVisible()
  await expect(trigger).toBeFocused()
  await page.mouse.move(out.x + out.width / 2, out.y + out.height / 2)
  await trigger.hover()
  await page.waitForTimeout(220)
  await expect(drawer).toBeVisible()
  await page.mouse.move(out.x + out.width / 2, out.y + out.height / 2)
  await expect(drawer).toBeHidden()
  await expect(panel).toBeVisible()

  await trigger.click()
  await expect(drawer).toBeVisible()
  await drawer.locator('[data-liangxiang-utility-action="mode"]').click()
  const confirm = drawer.locator('[data-liangxiang-mode-confirm]')
  await expect(confirm).toBeVisible()
  await page.mouse.move(out.x + out.width / 2, out.y + out.height / 2)
  await page.waitForTimeout(230)
  await expect(confirm).toBeVisible()
  await confirm.locator('[data-liangxiang-mode-cancel]').click()
  await expect(confirm).toBeHidden()
  await outside.click()
  await expect(drawer).toBeHidden()
})

test('utility short hints point toward the opposite ritual row and keyboard dismissal does not leave a sticky popup', async ({ page }) => {
  const panel = await openPanel(page)
  const trigger = panel.locator('[data-liangxiang-utility-trigger]')
  const entry = panel.locator('[data-liangxiang-liangci-entry]')
  const hint = trigger.locator('[data-liangxiang-hint]')
  const entryHint = entry.locator('[data-liangxiang-hint]')
  const drawer = panel.locator('[data-liangxiang-utility-drawer]')
  await trigger.hover()
  await expect.poll(() => hint.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  const triggerBox = (await trigger.boundingBox())!, entryBox = (await entry.boundingBox())!, hintBox = (await hint.boundingBox())!
  expect(hintBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height)
  expect(Math.abs(hintBox.y - entryBox.y)).toBeLessThanOrEqual(2)
  expect(Math.abs(hintBox.x + hintBox.width - entryBox.x - entryBox.width)).toBeLessThanOrEqual(1)
  expect(await hint.evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none')
  await entry.hover()
  await expect.poll(() => hint.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  await expect.poll(() => entryHint.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  expect((await entryHint.boundingBox())!.y + (await entryHint.boundingBox())!.height).toBeLessThanOrEqual(entryBox.y)

  await trigger.click()
  await expect(drawer).toBeVisible()
  await expect.poll(() => hint.evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect.poll(() => hint.evaluate(element => getComputedStyle(element).opacity)).toBe('0')

  await page.mouse.move(0, 0)
  await trigger.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(trigger).toBeFocused()
  await expect.poll(() => hint.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  await trigger.press('Enter')
  await expect(drawer).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(drawer.locator('[data-liangxiang-utility-action="home"]')).toBeFocused()
  await page.waitForTimeout(220)
  await expect(drawer).toBeVisible()
  await panel.getByRole('button', { name: '关闭面板', exact: true }).focus()
  await expect(drawer).toBeHidden()
  await expect(panel).toBeVisible()
})

test('utility hint paints over the calendar button while leaving its overlapping area clickable', async ({ page }) => {
  const panel = await openPanel(page)
  const trigger = panel.locator('[data-liangxiang-utility-trigger]')
  const entry = panel.locator('[data-liangxiang-liangci-entry]')
  const hint = trigger.locator('[data-liangxiang-hint]')
  // Merely hovering another control does not clear an existing keyboard ring.
  // The pointer hint must still paint above that later sibling's context.
  await page.mouse.move(0, 0)
  await page.keyboard.press('Tab')
  await entry.focus()
  await expect.poll(() => entry.evaluate(element => element.matches(':focus-visible'))).toBe(true)
  await trigger.hover()
  await expect.poll(() => entry.evaluate(element => element.matches(':focus-visible'))).toBe(true)
  await expect.poll(() => hint.evaluate(element => getComputedStyle(element).opacity)).toBe('1')

  const overlap = await hint.evaluate(element => {
    const entry = element.closest('[data-liangxiang-panel]')!.querySelector('[data-liangxiang-liangci-entry]')!
    const hintRect = element.getBoundingClientRect(), entryRect = entry.getBoundingClientRect()
    const left = Math.max(hintRect.left, entryRect.left), right = Math.min(hintRect.right, entryRect.right)
    const top = Math.max(hintRect.top, entryRect.top), bottom = Math.min(hintRect.bottom, entryRect.bottom)
    const x = (left + right) / 2, y = (top + bottom) / 2
    const passesThrough = entry.contains(document.elementFromPoint(x, y))
    const pointerEvents = getComputedStyle(element).pointerEvents
    // Hit testing normally skips this noninteractive hint. Temporarily make
    // it eligible to inspect the real paint order, then restore immediately.
    const oldPointerEvents = element.style.pointerEvents
    let paintedOnTop = false
    try {
      element.style.pointerEvents = 'auto'
      paintedOnTop = element.contains(document.elementFromPoint(x, y))
    } finally {
      element.style.pointerEvents = oldPointerEvents
    }
    return { x, y, width: right - left, height: bottom - top, pointerEvents, passesThrough, paintedOnTop }
  })
  expect(overlap.width).toBeGreaterThan(0)
  expect(overlap.height).toBeGreaterThan(0)
  expect(overlap.paintedOnTop).toBe(true)
  expect(overlap.pointerEvents).toBe('none')
  expect(overlap.passesThrough).toBe(true)
  await page.mouse.click(overlap.x, overlap.y)
  await expect(page.locator(liangciSelector)).toBeVisible()
})

test('Escape restores ritual focus without replaying pointer hints or highlights for the drawer, calendar, market and version notes', async ({ page }) => {
  const panel = await openPanel(page)
  const trigger = panel.locator('[data-liangxiang-utility-trigger]')
  const entry = panel.locator('[data-liangxiang-liangci-entry]')
  const drawer = panel.locator('[data-liangxiang-utility-drawer]')
  const quietStyle = (button: typeof trigger) => button.evaluate(element => {
    const style = getComputedStyle(element)
    return { color: style.color, background: style.backgroundColor, shadow: style.boxShadow, transform: style.transform, outline: style.outlineStyle }
  })
  await page.mouse.move(0, 0)
  const triggerRest = await quietStyle(trigger), entryRest = await quietStyle(entry)

  await trigger.click()
  await expect(drawer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('data-liangxiang-ritual-resting', 'pointer')
  await expect.poll(() => trigger.locator('[data-liangxiang-hint]').evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  expect(await quietStyle(trigger)).toEqual(triggerRest)
  await page.mouse.move(0, 0)
  await trigger.hover()
  await expect.poll(() => trigger.getAttribute('data-liangxiang-ritual-resting')).toBeNull()
  await expect.poll(() => trigger.locator('[data-liangxiang-hint]').evaluate(element => getComputedStyle(element).opacity)).toBe('1')

  await entry.click()
  const calendar = page.locator(liangciSelector)
  await expect(calendar).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(calendar).toBeHidden()
  await expect(entry).toBeFocused()
  await expect(entry).toHaveAttribute('data-liangxiang-ritual-resting', 'pointer')
  await expect.poll(() => entry.locator('[data-liangxiang-hint]').evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  expect(await quietStyle(entry)).toEqual(entryRest)

  await trigger.click()
  await drawer.locator('[data-liangxiang-utility-action="version"]').click()
  const notes = page.getByRole('dialog', { name: RELEASE_NOTES_TITLE })
  await expect(notes).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(notes).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('data-liangxiang-ritual-resting', 'pointer')
  await expect.poll(() => trigger.locator('[data-liangxiang-hint]').evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  expect(await quietStyle(trigger)).toEqual(triggerRest)

  await trigger.click()
  await drawer.locator('[data-liangxiang-utility-market]').click()
  const market = page.getByRole('dialog', { name: '梁股 · 香火市场', exact: true })
  await expect(market).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(market).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('data-liangxiang-ritual-resting', 'pointer')
  await expect.poll(() => trigger.locator('[data-liangxiang-hint]').evaluate(element => getComputedStyle(element).opacity)).toBe('0')
  expect(await quietStyle(trigger)).toEqual(triggerRest)

  // Keyboard activation keeps an accessible return ring, while suppressing
  // the informational hint until the next deliberate navigation gesture.
  await page.mouse.move(0, 0)
  await entry.focus()
  await entry.press('Enter')
  await expect(calendar).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(calendar).toBeHidden()
  await expect(entry).toBeFocused()
  await expect(entry).toHaveAttribute('data-liangxiang-ritual-resting', 'keyboard')
  await expect.poll(() => entry.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
  await expect.poll(() => entry.locator('[data-liangxiang-hint]').evaluate(element => getComputedStyle(element).opacity)).toBe('0')
})

test('梁祠 traps focus in both directions, closes with Escape, and restores entry focus', async ({ page }) => {
  const badge = page.locator(badgeSelector)
  await badge.focus()
  await badge.press('Enter')

  const entry = page.locator('[data-liangxiang-liangci-entry]')
  await entry.focus()
  await entry.press('Enter')

  const dialog = page.locator(liangciSelector)
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('role', 'dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAttribute('aria-labelledby', 'liangci-title')
  await expect(page.locator('#liangci-title')).toHaveText('梁祠')
  await expect(dialog).toBeFocused()

  const focusable = dialog.locator('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
  const first = focusable.first()
  const last = focusable.last()
  await page.keyboard.press('Shift+Tab')
  await expect(last).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(first).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(last).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(entry).toBeFocused()
})

test('reduced-motion removes panel and 梁祠 entry animations', async ({ page }) => {
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const badge = page.locator(badgeSelector)
  await badge.focus()
  await badge.press('Enter')
  const panel = page.locator(panelSelector)
  await expect(panel).toBeVisible()
  expect(await panel.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)

  const entry = page.locator('[data-liangxiang-liangci-entry]')
  await entry.focus()
  await entry.press('Enter')
  const dialog = page.locator(liangciSelector)
  await expect(dialog).toBeVisible()
  await waitForSettledAnimations(dialog)
  expect(await dialog.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
})
