import { expect, test, _electron as electron } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createDesktopTestEnv, seedIntroducedLearning } from './desktop-test-env'

for (const platform of ['win32', 'darwin']) {
  for (const theme of ['planche', 'dark']) {
    test(`${platform} controls and panel actions in ${theme}`, async ({ page }) => {
      await page.goto(`/window-controls.html?platform=${platform}&theme=${theme}`)
      const controls = page.locator('.window-controls')
      const actions = controls.locator('button')
      await expect(controls).toBeVisible()
      expect(await actions.evaluateAll(buttons => buttons.map(button => button.dataset.windowAction)))
        .toEqual(platform === 'darwin' ? ['close', 'minimize', 'maximize'] : ['minimize', 'maximize', 'close'])
      const bounds = await controls.boundingBox()
      expect(bounds).not.toBeNull()
      if (platform === 'darwin') expect(bounds!.x).toBeLessThan(20)
      else expect(bounds!.x + bounds!.width).toBe(page.viewportSize()!.width)

      await controls.getByRole('button', { name: 'Maximize', exact: true }).click()
      await expect(controls.getByRole('button', { name: 'Restore', exact: true })).toBeVisible()
      await controls.getByRole('button', { name: 'Restore', exact: true }).click()
      await controls.getByRole('button', { name: 'Minimize', exact: true }).click()
      await controls.getByRole('button', { name: 'Close', exact: true }).click()
      expect(await page.evaluate(() => (window as any).controlCalls)).toEqual(['maximize', 'maximize', 'minimize', 'confirmed-close'])

      const panel = page.locator('[data-floating-panel-interactive]').last()
      await expect(panel.getByRole('button')).toHaveCount(2)
      await panel.getByRole('button', { name: 'Maximize', exact: true }).click()
      await expect(page.getByText('Panel content')).toBeVisible()
      await panel.getByRole('button', { name: 'Restore', exact: true }).click()
      await page.screenshot({ path: test.info().outputPath(`${platform}-${theme}.png`) })
      await panel.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(page.getByText('Panel content')).toHaveCount(0)

      const dialog = page.locator('[data-dialog-header]')
      const closeBounds = await dialog.getByRole('button').boundingBox()
      const dialogBounds = await dialog.boundingBox()
      expect(closeBounds!.x).toBeGreaterThan(dialogBounds!.x + dialogBounds!.width / 2)
      await dialog.getByRole('button').focus()
      await page.keyboard.press('Enter')
      await expect(dialog).toHaveCount(0)
    })
  }
}

test('Windows native window state and close confirmation follow the shared controls', async () => {
  test.skip(process.platform !== 'win32')
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'janusx-window-controls-'))
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    const profile = join(root, 'profile')
    await mkdir(join(profile, 'janusx'), { recursive: true })
    await writeFile(join(profile, 'janusx', 'config.json'), JSON.stringify({ theme: 'planche', themeMigratedToSlate: true, language: 'en' }))
    app = await electron.launch({ args: [resolve('out/main/index.js'), `--user-data-dir=${profile}`], env: createDesktopTestEnv(root) })
    await seedIntroducedLearning(app.context())
    const page = await app.firstWindow()
    await page.reload()
    const controls = page.locator('.window-controls')
    await expect(controls).toHaveAttribute('data-platform', 'windows')
    await expect(controls).toHaveAttribute('data-maximized', 'false')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
    await expect(controls).toHaveAttribute('data-maximized', 'true')
    await controls.locator('[data-window-action="maximize"]').click()
    await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false)
    await expect(controls).toHaveAttribute('data-maximized', 'false')
    await controls.locator('[data-window-action="minimize"]').click()
    await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true)
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.restore(); window.show() })
    await controls.locator('[data-window-action="close"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('button', { name: /cancel/i })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click()
    await expect(controls).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('windows-desktop-titlebar.png') })
  } finally {
    await app?.close()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
