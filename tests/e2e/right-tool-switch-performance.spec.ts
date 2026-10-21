import { expect, test } from '@playwright/test'

test('repeated Git/session switches reuse recent data and the scan schedule', async ({ page }) => {
  await page.goto('/tool-palette.html')
  await page.getByRole('toolbar').getByRole('button', { name: /会话/ }).click()
  const sessions = page.locator('#right-tool-panel-sessions')
  await expect(sessions.locator('[data-session-id]')).toHaveCount(3)
  await sessions.getByRole('textbox').fill('终端管理')
  // Allow every rail target to activate, rather than only testing cancelled
  // requests inside the 100ms feedback window.
  const result = await page.evaluate(async () => {
    for (let cycle = 0; cycle < 8; cycle++) {
      document.querySelector<HTMLButtonElement>('[data-rail-tool="git"]')!.click()
      await new Promise((resolve) => setTimeout(resolve, 160))
      document.querySelector<HTMLButtonElement>('[data-rail-tool="sessions"]')!.click()
      await new Promise((resolve) => setTimeout(resolve, 160))
    }
    return (window as any).builtinExtensionFixture.state()
  })
  expect(result.sessionFilters.filter((filter: { cwd?: string }) => filter.cwd === 'C:/palette')).toHaveLength(1)
  expect(result.sessionScans).toBeLessThanOrEqual(1)
  await expect(sessions.getByRole('textbox')).toHaveValue('终端管理')
  await expect(sessions.locator('[data-session-id="session-review"]')).toBeVisible()
  expect(result.listeners).toBe(2)
  expect(result.toolActivations).toEqual(['sessions', ...Array.from({ length: 8 }, () => ['git', 'sessions']).flat()])
  await test.info().attach('switch-work.json', {
    body: JSON.stringify({ roundTrips: 8, scopedListReads: result.sessionFilters.filter((filter: { cwd?: string }) => filter.cwd === 'C:/palette').length,
      externalScans: result.sessionScans, listeners: result.listeners }, null, 2),
    contentType: 'application/json',
  })
})

test('a cached return catches up missed changes without a new event', async ({ page }) => {
  await page.clock.install()
  await page.goto('/tool-palette.html')
  await page.locator('#right-tool-rail-sessions').click()
  const card = page.locator('[data-session-id="session-review"]')
  await expect(card).toBeVisible()
  await page.locator('#right-tool-rail-git').click()
  await expect(page.locator('#right-tool-rail-git')).toHaveAttribute('aria-pressed', 'true')
  // Simulate a mutation while the inactive panel has no event subscriptions.
  await page.evaluate(() => {
    const original = window.electron.session.list
    window.electron.session.list = async (filter) => (await original(filter)).map((session) =>
      session.id === 'session-review' ? { ...session, firstPrompt: '后台更新后的标题' } : session)
  })
  await page.locator('#right-tool-rail-sessions').click()
  await expect(card).toContainText('检查终端管理')
  await page.clock.fastForward(5100)
  await expect(card).toContainText('后台更新后的标题')
})
