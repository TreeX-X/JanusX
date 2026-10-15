import { expect, test } from '@playwright/test'

test('shell overview separates disclosure, visibility and the unique default', async ({ page }) => {
  await page.goto('/shell-settings.html')
  const shells = page.getByRole('region', { name: '已配置 Shell' })
  await expect(shells.getByRole('textbox')).toHaveCount(0)
  const powershell = shells.locator('[data-shell-entry="powershell"]')
  const bash = shells.locator('[data-shell-entry="bash"]')
  await expect(powershell.getByRole('button', { name: '设为默认 Shell' })).toHaveAttribute('aria-pressed', 'true')
  await bash.getByRole('button', { name: '设为默认 Shell' }).click()
  await expect(bash.getByRole('button', { name: '设为默认 Shell' })).toHaveAttribute('aria-pressed', 'true')
  await expect(powershell.getByRole('button', { name: '设为默认 Shell' })).toHaveAttribute('aria-pressed', 'false')
  await bash.getByRole('button', { name: '在新建终端入口显示' }).click()
  await expect(bash.getByRole('button', { name: '已从新建终端入口隐藏' })).toHaveAttribute('aria-pressed', 'false')
  await expect(bash.getByRole('button', { expanded: false })).toHaveCount(1)
  await bash.getByRole('button', { expanded: false }).focus()
  await page.keyboard.press('Enter')
  await expect(bash.getByLabel('自由命令')).toHaveValue('"C:\\Program Files\\Git\\bin\\bash.exe"')
  await bash.getByLabel('启动后缀').fill('--noprofile')
  await bash.getByRole('button', { expanded: true }).click()
  await expect(bash.getByRole('button', { expanded: false })).toContainText('--noprofile')
})

test('new shell opens its editor, focuses its name and requires a command before becoming default', async ({ page }) => {
  await page.goto('/shell-settings.html?empty')
  const shells = page.getByRole('region', { name: '已配置 Shell' })
  await page.getByRole('button', { name: '添加 Shell' }).click()
  await expect(shells.getByLabel('名称')).toBeFocused()
  await expect(shells.getByRole('button', { name: '设为默认 Shell' })).toBeDisabled()
  await shells.getByLabel('自由命令').fill('pwsh')
  await expect(shells.getByRole('button', { name: '设为默认 Shell' })).toBeEnabled()
  await shells.getByRole('button', { name: '删除条目' }).click()
  await expect(shells.locator('[data-shell-entry]')).toHaveCount(0)
})

test('failed default change restores the previous visible state', async ({ page }) => {
  await page.goto('/shell-settings.html?fail')
  const bash = page.locator('[data-shell-entry="bash"]')
  await bash.getByRole('button', { name: '设为默认 Shell' }).click()
  await expect(bash.getByRole('button', { name: '设为默认 Shell' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('保存失败，已回滚到上一次有效配置')).toBeVisible()
})

for (const theme of ['planche', 'dark']) {
  for (const width of [1100, 640, 390]) {
    test(`shell editor fits ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 })
      await page.goto(`/shell-settings.html?theme=${theme}&en`)
      const shells = page.getByRole('region', { name: 'Configured shells' })
      const bash = shells.locator('[data-shell-entry="bash"]')
      await bash.getByRole('button', { expanded: false }).click()
      const input = bash.getByLabel('Command', { exact: true })
      await expect(input).toBeVisible()
      const bounds = await shells.boundingBox()
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(await shells.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      await shells.screenshot({ path: test.info().outputPath(`shells-${theme}-${width}.png`) })
    })
  }
}
