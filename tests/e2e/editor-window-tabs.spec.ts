import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createDesktopTestEnv } from './desktop-test-env'

type EditorWindowAPI = Window & {
  electron: {
    window: {
      openEditor(payload: { filePath: string; workspacePath: string }): Promise<{ success?: boolean }>
    }
  }
}

function editorWindows(application: ElectronApplication): Page[] {
  return application.windows().filter((page) => new URL(page.url()).searchParams.get('editorWindow') === '1')
}

test('file opens share one workspace editor window and switch existing tabs', async () => {
  const entry = resolve('out/main/index.js')
  let root = ''
  let application: ElectronApplication | undefined

  try {
    await access(entry)
    root = await mkdtemp(join(tmpdir(), 'janusx-editor-tabs-'))
    const userDataDir = join(root, 'user-data')
    const workspacePath = join(root, 'workspace')
    const firstPath = join(workspacePath, 'first.ts')
    const secondPath = join(workspacePath, 'second.ts')
    await Promise.all([mkdir(userDataDir, { recursive: true }), mkdir(workspacePath, { recursive: true })])
    await Promise.all([
      writeFile(firstPath, 'export const first = true\n'),
      writeFile(secondPath, 'export const second = true\n'),
    ])

    application = await electron.launch({
      args: [entry, `--user-data-dir=${userDataDir}`],
      env: createDesktopTestEnv(root),
    })
    const mainPage = await application.firstWindow({ timeout: 30_000 })

    await mainPage.evaluate(
      async ({ first, second, workspace }) => {
        await Promise.all([
          (window as EditorWindowAPI).electron.window.openEditor({ filePath: first, workspacePath: workspace }),
          (window as EditorWindowAPI).electron.window.openEditor({ filePath: second, workspacePath: workspace }),
        ])
      },
      { first: firstPath, second: secondPath, workspace: workspacePath },
    )

    await expect.poll(() => editorWindows(application!).length).toBe(1)
    const editorPage = editorWindows(application)[0]
    await expect(editorPage.locator('#root')).not.toBeEmpty()
    await expect(editorPage.locator('[data-editor-window-state="ready"]')).toBeVisible()
    await expect(editorPage.locator('[data-editor-window-state="error"]')).toHaveCount(0)
    await expect(editorPage.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 })
    await editorPage.screenshot({ path: test.info().outputPath('standalone-editor-ready.png') })
    const tabs = editorPage.locator('[data-editor-tab]')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.filter({ hasText: 'second.ts' })).toHaveAttribute('data-active', 'true')
    const code = editorPage.locator('.monaco-editor .view-lines')
    await expect(code).toContainText('export const second = true')

    const dragRegion = editorPage.locator('[data-editor-drag-region]')
    const dragStrip = editorPage.locator('[data-editor-window-drag-strip]')
    await expect(dragRegion).toHaveCSS('-webkit-app-region', 'drag')
    await expect(dragStrip).toHaveCSS('-webkit-app-region', 'drag')
    await expect(tabs.first()).toHaveCSS('-webkit-app-region', 'no-drag')
    const dragStripBox = await dragStrip.boundingBox()
    expect(dragStripBox?.height).toBe(8)
    expect(dragStripBox?.width).toBeGreaterThan(1000)
    expect(await dragStrip.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === element
    })).toBe(true)

    await mainPage.evaluate(
      ({ first, workspace }) => (window as EditorWindowAPI).electron.window.openEditor({ filePath: first, workspacePath: workspace }),
      { first: firstPath, workspace: workspacePath },
    )

    await expect(editorWindows(application)).toHaveLength(1)
    await expect(tabs).toHaveCount(2)
    await expect(tabs.filter({ hasText: 'first.ts' })).toHaveAttribute('data-active', 'true')
    await expect(code).toContainText('export const first = true')
    await expect(code).not.toContainText('export const second = true')
  } finally {
    if (application) await application.close().catch(() => undefined)
    if (root) await rm(root, { recursive: true, force: true })
  }
})
