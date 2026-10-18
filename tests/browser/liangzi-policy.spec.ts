import { expect, test } from '@playwright/test'
import { LIANGZI_POLICY_VERSION } from '../../src/domain/index.ts'
import { parseWireState } from '../../src/shared/wire.ts'
import { bootInstalledLiangxiang, openPanel, badgeSelector } from './helpers.ts'

test('a real local down vote shows 小难梁 in the panel and dock with a readable transparent portrait', async ({ page }, testInfo) => {
  await bootInstalledLiangxiang(page)
  const read = async () => parseWireState(await (await page.request.get('/liangxiang/api/state')).json())
  const before = await read()
  test.skip(before.authorityMode !== 'LOCAL_FAKE_DEV', 'Uses only the disposable local ledger')
  const cycle = async () => parseWireState(await (await page.request.post('/liangxiang/api/local/cycle-case')).json())
  const next = await cycle()
  try {
    expect(next.global.liangziPolicyVersion).toBe(LIANGZI_POLICY_VERSION)
    expect(next.personal.remainingIncense).toBeGreaterThan(0)
    const panel = await openPanel(page)
    await expect(panel.locator('[data-liangxiang-case-title]')).toContainText(next.activeCase.title)
    await panel.locator('[data-liangxiang-vote="down"]').click()
    const figure = panel.locator('[data-liangxiang-avatar="xiao_nan_liang"] img')
    await expect(figure).toBeVisible()
    await expect(figure).toHaveAttribute('alt', /小难梁（夯率 < 25%）/)
    await expect(page.locator(`${badgeSelector} [data-liangxiang-avatar="xiao_nan_liang"] img`)).toBeVisible()
    await expect.poll(() => figure.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(256)
    await panel.screenshot({ path: testInfo.outputPath('xiao-nan-liang-panel.png') })
  } finally {
    for (let i = 0; i < 12; i += 1) {
      if ((await cycle()).activeCase.id === before.activeCase.id) break
    }
  }
})
