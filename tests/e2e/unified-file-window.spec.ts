import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createDesktopTestEnv } from './desktop-test-env'

test('default embedded opens, whole-session float and re-embed preserve drafts and subsequent routing', async ({}, testInfo) => {
  const root = await mkdtemp(join(tmpdir(), 'janusx-unified-files-'))
  let app: ElectronApplication | undefined
  try {
    const workspacePath = join(root, 'project')
    await mkdir(workspacePath)
    const first = join(workspacePath, 'first.ts')
    const second = join(workspacePath, 'second.md')
    const third = join(workspacePath, 'third.ts')
    const office = join(workspacePath, 'report.docx')
    await Promise.all([
      writeFile(first, 'export const first = true\n'),
      writeFile(second, '# Preview document\n\nHello file window.\n'),
      writeFile(third, 'export const third = true\n'),
      writeFile(office, 'fixture'),
    ])
    app = await electron.launch({ args: [resolve('out/main/index.js'), `--user-data-dir=${join(root, 'data')}`], env: createDesktopTestEnv(root) })
    const main = await app.firstWindow()
    main.on('pageerror', error => console.log('Main page:', error.message))
    await main.waitForFunction(() => typeof (window as any).electron?.window?.openEditor === 'function')
    await expect(main.locator('header').first()).toBeVisible({ timeout: 40_000 })
    await main.evaluate(async path => { await (window as any).electron.workspace.create({ path, name: 'Files' }) }, workspacePath)
    // Exercise the production Office component and lease handoff without depending on a local OfficeCLI installation.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('office:preview:start')
      ipcMain.handle('office:preview:start', () => ({ ok: false, error: { code: 'UNAVAILABLE', message: 'Fixture Office unavailable' } }))
    })
    const open = (filePath: string) => main.evaluate(payload => (window as any).electron.window.openEditor(payload), { filePath, workspacePath })
    expect(await open(first)).toMatchObject({ success: true })
    const embedded = main.locator('[data-editor-host="embedded"]')
    await expect(embedded).toBeVisible()
    await expect(embedded.getByRole('button', { name: '最小化', exact: true })).toHaveCount(0)
    await expect(embedded.locator('[data-editor-window-drag-strip]')).toHaveCount(0)
    await expect(embedded.locator('.monaco-editor')).toBeVisible()
    await embedded.locator('.monaco-editor').click()
    await main.keyboard.press('Control+End')
    await main.keyboard.type('// unsaved migration')
    await open(second)
    await expect(embedded.locator('.preview-scroll-viewport')).toContainText('Hello file window')
    await expect(embedded.locator('.monaco-editor')).toHaveCount(0)
    await expect(embedded.locator('[data-editor-tab]')).toHaveCount(2)
    await main.screenshot({ path: testInfo.outputPath('embedded.png') })
    await embedded.getByRole('button', { name: '返回独立浮窗' }).click()
    await expect(embedded).toHaveCount(0)
    await expect.poll(() => app!.windows().filter(page => page.url().includes('editorWindow=1')).length).toBe(1)
    const floating = app.windows().find(page => page.url().includes('editorWindow=1'))!
    await expect(floating.locator('[data-editor-tab]')).toHaveCount(2)
    await floating.locator('[data-editor-tab]').filter({ hasText: 'first.ts' }).click()
    await expect(floating.locator('.view-lines')).toContainText('// unsaved migration')
    await open(third)
    await expect(floating.locator('[data-editor-tab]')).toHaveCount(3)
    await open(first)
    await expect(floating.locator('[data-editor-tab]')).toHaveCount(3)
    await expect(floating.locator('.view-lines')).toContainText('// unsaved migration')
    await floating.screenshot({ path: testInfo.outputPath('floating.png') })
    await floating.getByRole('button', { name: /嵌入主/ }).click()
    await expect(embedded).toBeVisible()
    await expect(embedded.locator('[data-editor-tab]')).toHaveCount(3)
    await expect(embedded.locator('.view-lines')).toContainText('// unsaved migration')
    await expect.poll(() => app!.windows().filter(page => page.url().includes('editorWindow=1')).length).toBe(0)
    await open(office)
    await expect(embedded.locator('[data-editor-tab]')).toHaveCount(4)
    await expect(embedded.getByRole('button', { name: '重试', exact: true })).toBeVisible()
    await expect(embedded.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
    await embedded.getByRole('button', { name: '收起文件面板' }).click()
    await expect(embedded).toHaveCount(0)
    await open(first)
    await expect(embedded.locator('[data-editor-tab]')).toHaveCount(4)
    await expect(embedded.locator('.view-lines')).toContainText('// unsaved migration')
  } finally {
    if (app) await app.close()
    await rm(root, { recursive: true, force: true })
  }
})
