import { expect, test, type Page } from '@playwright/test'

async function fixtureState(page: Page) {
  return page.evaluate(() => (window as unknown as { sidebarFixture: { state: () => { workspace: string; terminal: string; pane: string; tab: string; terminals: number; scope: string } } }).sidebarFixture.state())
}

async function expandFirst(page: Page) {
  await page.locator('.workspace-sidebar__expanded .ws').first().locator('button').first().click()
  await expect(page.locator('[data-sidebar-terminal="review"]')).toBeVisible()
  // Native HTML drag is cancelled if the expanding ancestor moves during dragstart.
  await page.locator('.workspace-sidebar__expanded').evaluate(async node => {
    await Promise.all(node.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)))
  })
}

test('sidebar clicks focus the existing pane and follow the terminal checkout', async ({ page }) => {
  await page.goto('/sidebar.html')
  await expandFirst(page)
  await page.locator('[data-sidebar-terminal="feature-cli"]').click()
  expect(await fixtureState(page)).toMatchObject({ workspace: 'ws-0', terminal: 'feature-cli', pane: 'right', tab: 'terminal:feature-cli', terminals: 3, scope: 'C:/projects/JanusX-sidebar' })
  const shell = page.locator('[data-sidebar-terminal="shell"]')
  await shell.focus()
  await page.keyboard.press('Enter')
  expect(await fixtureState(page)).toMatchObject({ terminal: 'shell', pane: 'left', tab: 'terminal:shell', scope: 'C:/projects/JanusX' })
  await page.locator('[data-sidebar-terminal="review"]').focus()
  await page.keyboard.press('Space')
  expect(await fixtureState(page)).toMatchObject({ terminal: 'review', pane: 'left', terminals: 3 })
})

test('background terminal restores its workspace and can return to the prior pane', async ({ page }) => {
  await page.goto('/sidebar.html')
  await expandFirst(page)
  await page.locator('.workspace-sidebar__expanded .ws').nth(1).locator('button').first().click()
  await page.locator('[data-sidebar-terminal="background"]').click()
  expect(await fixtureState(page)).toMatchObject({ workspace: 'ws-1', terminal: 'background', tab: 'terminal:background', terminals: 1, scope: 'C:/projects/Agent runtime' })
  await page.locator('[data-sidebar-terminal="feature-cli"]').click()
  expect(await fixtureState(page)).toMatchObject({ workspace: 'ws-0', terminal: 'feature-cli', pane: 'right', terminals: 3 })
})

test('hover and keyboard reveal actions without moving the project name', async ({ page }) => {
  await page.goto('/sidebar.html')
  const row = page.locator('.workspace-sidebar__expanded .ws').first()
  const name = row.locator(':scope > span').last()
  await page.mouse.move(600, 600)
  const before = await name.boundingBox()
  await row.hover()
  await expect(row.getByRole('button', { name: '更多操作' })).toHaveCSS('opacity', '1')
  expect(await name.boundingBox()).toEqual(before)
  await page.mouse.move(600, 600)
  await row.getByRole('button', { name: '更多操作' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: '运行配置…', exact: true })).toBeVisible()
})

test('terminal drag keeps its existing transfer identity without selecting it', async ({ page }) => {
  await page.goto('/sidebar.html')
  await expandFirst(page)
  await page.locator('[data-sidebar-terminal="feature-cli"]').dragTo(page.locator('[data-terminal-drop-target]'))
  expect(await fixtureState(page)).toMatchObject({ terminal: 'review', pane: 'left', terminals: 3, droppedTerminal: 'feature-cli' })
})

for (const theme of ['planche', 'dark']) {
  test(`sidebar remains readable and compact in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 760 })
    await page.goto(`/sidebar.html?theme=${theme}`)
    await expandFirst(page)
    await page.mouse.move(600, 600)
    const sidebar = page.locator('aside')
    expect(await sidebar.locator('.workspace-sidebar__expanded').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await expect(page.locator('[data-sidebar-terminal="review"]')).toHaveCSS('font-family', await sidebar.evaluate(node => getComputedStyle(node).fontFamily))
    await sidebar.screenshot({ path: test.info().outputPath(`sidebar-${theme}.png`) })
    await page.getByRole('button', { name: '收起工作区侧栏' }).click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    await page.getByRole('button', { name: '展开工作区侧栏' }).click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false')
  })
}
