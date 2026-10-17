import { test, expect } from '@playwright/test'

for (const theme of ['dark', 'planche']) {
  test(`model capabilities, cache prices and tier rules in ${theme}`, async ({ page }) => {
    await page.goto(`/model-catalog.html?theme=${theme}`)
    await page.getByText('Reasoning Pro', { exact: true }).click()
    await expect(page.getByRole('heading', { name: '上下文与能力' })).toBeVisible()
    const pricing = page.getByRole('region', { name: '定价与特殊价格' }).first()
    await expect(pricing.getByText('$0.2', { exact: true })).toBeVisible()
    await pricing.getByText('输入达到 200,000 tokens 的阶梯价格').click()
    await expect(pricing.getByText('$15', { exact: true })).toBeVisible()
    await pricing.getByText('其他计费与原始规则').click()
    await expect(pricing.getByText('0.01', { exact: true })).toBeVisible()
    await page.screenshot({ path: `artifacts/model-catalog/${theme}.png`, fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(pricing).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `artifacts/model-catalog/${theme}-narrow.png`, fullPage: true })
    await page.getByRole('searchbox').fill('minimal')
    await expect(page.getByText('Reasoning Pro', { exact: true })).toHaveCount(0)
    await page.getByText('Minimal', { exact: true }).click()
    await expect(page.getByText('未提供', { exact: true })).toHaveCount(4)
    await page.getByRole('button', { name: '更新目录' }).click()
    await expect(page.getByText('已更新 2 个模型')).toBeVisible()
  })
}
