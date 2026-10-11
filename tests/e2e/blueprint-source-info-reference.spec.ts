import { expect, test } from '@playwright/test'

for (const surface of ['', '&workbench']) {
  test(`cross-repository reference identifies its source and opens the Note ${surface}`, async ({ page }) => {
    await page.goto('/blueprint-architecture.html?v2&clean&external' + surface)
    await page.getByRole('button', { name: /^数据来源/ }).click()
    const dialog = page.getByRole('dialog', { name: '数据来源' })
    const issue = dialog.locator('.bp-source-issue').filter({ hasText: '跨仓引用暂不可核对' })
    await expect(issue).toContainText('来源 Note 的正文仍可读取')
    await expect(issue).not.toContainText('文档读取需要检查')
    await expect(issue.locator('details p')).not.toBeVisible()
    await issue.getByText('技术详情', { exact: true }).click()
    await expect(issue.locator('details p')).toContainText('NOT_READY')
    await issue.getByRole('button', { name: '查看来源 Note：Storage decision' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.bp-node-detail')).toContainText('Storage decision')
  })
}
