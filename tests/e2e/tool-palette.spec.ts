import { expect, test } from '@playwright/test'

for (const theme of ['planche', 'dark']) {
  test(`tool and workspace menu surfaces resolve in ${theme}`, async ({ page }) => {
    await page.goto(`/tool-palette.html?theme=${theme}`)
    const files = page.getByRole('tabpanel', { name: /文件/ })
    await expect(files).toBeVisible()
    const dock = files.locator('..').locator('..').locator('..')
    await expect(dock).toHaveCSS('background-color', theme === 'planche' ? 'rgb(239, 228, 197)' : 'rgb(30, 30, 32)')
    await page.locator('.ws').filter({ hasText: 'JanusX' }).hover()
    await page.getByRole('button', { name: '更多操作', exact: true }).click()
    const action = page.getByRole('button', { name: /运行配置/ }).last()
    await expect(action).toBeVisible()
    const menu = action.locator('..')
    await expect(menu).toHaveCSS('background-color', theme === 'planche' ? 'rgb(243, 235, 215)' : 'rgb(37, 37, 39)')
    await action.hover()
    await expect(action).toHaveCSS('background-color', theme === 'planche' ? 'rgb(234, 224, 200)' : 'rgba(255, 255, 255, 0.06)')
    await page.screenshot({ path: test.info().outputPath(`tool-palette-${theme}.png`) })
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await page.locator('#right-tool-tab-sessions').click()
    await expect(page.getByText('优化文件管理和工作区菜单的视觉层级', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: test.info().outputPath(`tool-sessions-${theme}.png`) })
  })
}
