import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
      env: { ...process.env, ELECTRON_RENDERER_URL: '', NODE_ENV: 'production' },
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
    const tabs = editorPage.locator('[data-editor-tab]')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.filter({ hasText: 'second.ts' })).toHaveAttribute('data-active', 'true')

    await mainPage.evaluate(
      ({ first, workspace }) => (window as EditorWindowAPI).electron.window.openEditor({ filePath: first, workspacePath: workspace }),
      { first: firstPath, workspace: workspacePath },
    )

    await expect(editorWindows(application)).toHaveLength(1)
    await expect(tabs).toHaveCount(2)
    await expect(tabs.filter({ hasText: 'first.ts' })).toHaveAttribute('data-active', 'true')
  } finally {
    if (application) await application.close().catch(() => undefined)
    if (root) await rm(root, { recursive: true, force: true })
  }
})
