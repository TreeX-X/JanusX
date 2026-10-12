import { expect, test } from '@playwright/test'

for (const surface of ['', '&workbench']) {
  test(`cross-repository references stay silent and local Notes remain readable ${surface}`, async ({ page }) => {
    await page.goto('/blueprint-architecture.html?v2&clean&external' + surface)
    await expect(page.locator('.bp-source-attention')).toHaveCount(0)
    await page.getByRole('button', { name: /^数据来源/ }).click()
    const dialog = page.getByRole('dialog', { name: '数据来源' })
    await expect(dialog.getByRole('region', { name: '需要检查的问题' })).toHaveCount(0)
    await expect(dialog).not.toContainText('没有额外的解析问题')
    await expect(dialog.locator('.bp-source-issue')).toHaveCount(0)
    await expect(dialog).not.toContainText('跨工作区引用')
    await expect(dialog).not.toContainText('NOT_READY')
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await page.evaluate(() => (window as any).architectureFixture.focus('Storage decision'))
    await expect(page.locator('.bp-node-detail')).toContainText('Storage decision')
  })
}
