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

test('F12 opens an unopened TypeScript definition in the workspace editor', async () => {
  const entry = resolve('out/main/index.js')
  let root = ''
  let application: ElectronApplication | undefined

  try {
    await access(entry)
    root = await mkdtemp(join(tmpdir(), 'janusx-editor-definition-'))
    const userDataDir = join(root, 'user-data')
    const workspacePath = join(root, 'workspace')
    const definitionPath = join(workspacePath, 'definition.ts')
    const usagePath = join(workspacePath, 'usage.ts')
    await Promise.all([mkdir(userDataDir, { recursive: true }), mkdir(workspacePath, { recursive: true })])
    await Promise.all([
      writeFile(definitionPath, 'export const targetValue = 42\n'),
      writeFile(usagePath, "import { targetValue } from './definition'\nconsole.log(targetValue)\n"),
    ])

    application = await electron.launch({
      args: [entry, `--user-data-dir=${userDataDir}`],
      env: createDesktopTestEnv(root),
    })
    const mainPage = await application.firstWindow({ timeout: 30_000 })
    await mainPage.evaluate(
      ({ filePath, workspace }) => (window as EditorWindowAPI).electron.window.openEditor({ filePath, workspacePath: workspace }),
      { filePath: usagePath, workspace: workspacePath },
    )

    await expect.poll(() => editorWindows(application!).length).toBe(1)
    const editorPage = editorWindows(application)[0]
    const tabs = editorPage.locator('[data-editor-tab]')
    await expect(editorPage.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 })
    await expect(tabs).toHaveCount(1)

    await editorPage.locator('.monaco-editor').click()
    await editorPage.keyboard.press('Control+f')
    await editorPage.keyboard.type('targetValue')
    await editorPage.keyboard.press('Enter')
    await editorPage.keyboard.press('Escape')
    await editorPage.keyboard.press('ArrowLeft')
    await editorPage.keyboard.press('F12')

    await expect(tabs).toHaveCount(2, { timeout: 30_000 })
    await expect(tabs.filter({ hasText: 'definition.ts' })).toHaveAttribute('data-active', 'true')
    await expect(editorPage.locator('.view-lines')).toContainText('export const targetValue = 42')
  } finally {
    if (application) await application.close().catch(() => undefined)
    if (root) await rm(root, { recursive: true, force: true })
  }
})
