// Note: Isolated product screenshots — see .agents/notes/implemented/feature/2026-09-18-product-tour.md
import { _electron as electron } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createDesktopTestEnv } from '../tests/e2e/desktop-test-env.ts'

const fixture = await mkdtemp(join(tmpdir(), 'janusx-product-'))
const project = join(fixture, 'hello-janus')
const output = resolve('wiki/assets')
await mkdir(join(project, 'src'), { recursive: true })
await mkdir(output, { recursive: true })
await writeFile(join(project, 'README.md'), '# Hello Janus\n\nA small workspace for exploring JanusX.\n\n- Open your project files\n- Run commands in the terminal\n- Keep tools beside your work\n')
await writeFile(join(project, 'src', 'greeting.ts'), 'export function greet(name: string): string {\n  return `Hello, ${name}!`\n}\n\nconsole.log(greet("JanusX"))\n')
await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'hello-janus', private: true, scripts: { dev: 'vite', build: 'vite build' }, devDependencies: { vite: '^6.0.0' } }, null, 2))
await writeFile(join(project, 'vite.config.ts'), 'export default {}\n')
const app = await electron.launch({ args: [resolve('out/main/index.js'), `--user-data-dir=${join(fixture, 'profile')}`], env: createDesktopTestEnv(fixture) })
try {
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForFunction(() => Boolean(window.electron?.workspace))
  await page.evaluate(async path => {
    await window.electron.workspace.create({ name: 'Hello Janus', path })
  }, project)
  await page.reload()
  await page.getByRole('button', { name: '稍后再说，先用本地功能' }).click()
  await page.getByRole('button', { name: 'Shell', exact: true }).click()
  await page.locator('.xterm-helper-textarea').waitFor({ state: 'attached' })
  const terminal = page.locator('.xterm-helper-textarea').first()
  await terminal.focus()
  await terminal.pressSequentially('function prompt { "PS hello-janus> " }; Clear-Host')
  await terminal.press('Enter')
  await terminal.pressSequentially('echo "Hello Janus - your workspace is ready"')
  await terminal.press('Enter')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: join(output, 'workspace.png') })
  await page.locator('.ws').filter({ hasText: 'Hello Janus' }).click({ button: 'right' })
  await page.getByRole('button', { name: '运行配置…', exact: true }).click()
  await page.locator('.ws-config-modal').waitFor()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(output, 'run-config.png') })
  await page.locator('.ws-config-modal').getByRole('button', { name: 'Close' }).click()
  const files = page.getByRole('button', { name: /打开文件工具/ })
  if (!((await files.getAttribute('aria-label')) || '').includes('当前')) await files.click()
  const editorPromise = app.waitForEvent('window')
  await page.locator('[data-file-path="README.md"]').dblclick()
  const editor = await editorPromise
  await editor.getByRole('button', { name: '嵌入主窗口工作区' }).click()
  await page.getByRole('region', { name: 'Embedded file editor' }).waitFor()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(output, 'file-editor.png') })
  console.log('Captured workspace, run configuration, and embedded editor.')
} finally {
  await app.close()
}
