import { test, expect } from '@playwright/test'

for (const theme of ['dark', 'planche']) {
  test(`compact cost total and engine filters in ${theme}`, async ({ page }) => {
    await page.goto(`/usage.html?theme=${theme}`)
    await expect(page.getByTestId('usage-cost')).toContainText('$0.0181')
    await expect(page.getByTestId('usage-cost')).toHaveAttribute('title', '已计价 75% tokens')
    await expect(page.getByTestId('usage-summary').getByTestId('usage-cost')).toBeVisible()
    await expect(page.getByText('按模型查看费用明细')).toHaveCount(0)
    await expect(page.getByText('按当前 OpenRouter 目录报价估算已计价部分', { exact: false })).toHaveCount(0)
    expect((await page.getByTestId('usage-cost').locator('..').boundingBox())!.height).toBeLessThanOrEqual(24)
    await page.getByRole('button', { name: 'Codex', exact: true }).click()
    await expect(page.getByTestId('usage-cost')).toHaveAttribute('title', '已计价 100% tokens')
    await page.getByRole('button', { name: 'Claude Code', exact: true }).click()
    await expect(page.getByTestId('usage-cost')).toHaveText('–')
    await expect(page.getByTestId('usage-cost')).toHaveAttribute('title', '暂无可匹配的模型报价')
    await page.getByRole('button', { name: '全部', exact: true }).click()
    await expect(page.getByTestId('usage-cost')).toContainText('$0.0181')
    await page.getByRole('button', { name: '更新价格', exact: true }).click()
    await expect(page.getByTestId('usage-cost')).toContainText('$0.0181')
    await page.screenshot({ path: `artifacts/usage-cost/${theme}.png`, fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
