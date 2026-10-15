import { expect, test } from '@playwright/test'

test('CLI rows retain install, upgrade, detection and visibility actions', async ({ page }) => {
  await page.goto('/shell-settings.html?cliStates')
  const cli = page.getByRole('region', { name: '外部 CLI', exact: true })
  await expect(cli.locator('[data-cli-tool]')).toHaveCount(6)
  const claude = cli.getByRole('group', { name: 'Claude Code', exact: true })
  const codex = cli.getByRole('group', { name: 'Codex', exact: true })
  await expect(claude.getByText('有新版', { exact: true })).toBeVisible()
  await claude.getByRole('button', { name: '升级', exact: true }).click()
  await expect(claude.getByText('就绪', { exact: true })).toBeVisible()
  await codex.getByRole('button', { name: '安装', exact: true }).click()
  await expect(codex.getByText('就绪', { exact: true })).toBeVisible()
  await codex.getByRole('button', { name: '重新检测', exact: true }).click()
  await expect(codex.getByRole('button', { name: '重新检测', exact: true })).toBeVisible()
  await codex.getByRole('button', { name: '在新建终端入口显示', exact: true }).click()
  await expect(codex.getByRole('button', { name: '已从新建终端入口隐藏', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(cli.getByRole('group', { name: 'OpenCode', exact: true }).getByText('已安装但不可运行')).toBeVisible()
})

for (const theme of ['planche', 'dark']) {
  for (const width of [1100, 640, 390]) {
    test(`CLI identity, status and actions fit ${theme} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 })
      await page.goto(`/shell-settings.html?cliStates&theme=${theme}`)
      const cli = page.getByRole('region', { name: '外部 CLI', exact: true })
      await expect(cli.getByRole('group', { name: 'DeepSeek Harness', exact: true })).toBeVisible()
      for (const row of await cli.locator('[data-cli-tool]').all()) {
        expect(await row.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
        const bounds = await row.boundingBox()
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      }
      await cli.screenshot({ path: test.info().outputPath(`external-cli-${theme}-${width}.png`) })
    })
  }
}
