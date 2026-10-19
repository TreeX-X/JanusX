// Launch only an isolated test profile; leave running user instances untouched.
import { _electron as electron, expect } from '@playwright/test'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const label = process.argv[2] ?? 'candidate'
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Use a simple label')
const directory = resolve('artifacts/performance-current')
const root = join(directory, `profile-${label}-${randomUUID()}`)
await mkdir(join(root, 'profile', 'janusx'), { recursive: true })
await writeFile(join(root, 'profile', 'janusx', 'config.json'), JSON.stringify({
  notificationSettings: { desktopEnabled: true, remote: { enabled: false } },
}))
const started = performance.now()
let application
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
try {
  application = await electron.launch({
    args: [join(directory, `${label}-app/main/index.js`), `--user-data-dir=${join(root, 'profile')}`],
    env: { ...environment, ELECTRON_RENDERER_URL: '', NODE_ENV: 'production',
      JANUSX_KNOWLEDGE_ROOT: join(root, 'knowledge'), CODEX_HOME: join(root, '.codex'),
      XDG_DATA_HOME: join(root, '.local/share'), OPENCODE_DB: join(root, 'unused-opencode.db'),
      HOME: root, USERPROFILE: root, APPDATA: join(root, 'appdata'), LOCALAPPDATA: join(root, 'localappdata') },
  })
  const page = await application.firstWindow()
  await page.locator('#root > *').first().waitFor()
  const firstContentMs = performance.now() - started
  // Main-process timer lag after first content. It is not a startup CPU profile.
  await application.evaluate(() => {
    globalThis.__janusPerfLag = []
    let expected = performance.now() + 10
    globalThis.__janusPerfTimer = setInterval(() => {
      const now = performance.now()
      globalThis.__janusPerfLag.push(Math.max(0, now - expected))
      expected = now + 10
    }, 10)
  })
  const samples = []
  for (const atSeconds of process.argv.includes('--checks-only') ? [] : [5, 30]) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, atSeconds * 1000 - (performance.now() - started))))
    const main = await application.evaluate(({ app }) => ({
      memory: process.memoryUsage(), metrics: app.getAppMetrics(),
      lag: globalThis.__janusPerfLag.splice(0),
    }))
    const renderer = await page.evaluate(() => ({ memory: performance.memory ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
    } : null, nodes: document.getElementsByTagName('*').length }))
    samples.push({ atSeconds, actualElapsedMs: performance.now() - started, main, renderer })
  }
  let terminalChecks
  if (process.argv.includes('--check-terminal')) {
    terminalChecks = await page.evaluate(async cwd => {
      const api = window.electron.terminal
      const id = crypto.randomUUID()
      let listener = () => {}
      let ready
      let readyTimeout
      const firstOutput = new Promise((resolve, reject) => {
        ready = resolve
        readyTimeout = setTimeout(() => reject(Error('No PTY output')), 10000)
      })
      const dispose = api.onData(event => {
        if (event.id !== id) return
        clearTimeout(readyTimeout)
        ready()
        listener(event.data)
      })
      try {
        await api.create({ id, cwd, shell: 'cmd.exe', shellCommand: 'cmd.exe /d /q', preset: 'shell', cols: 120, rows: 40 })
        await firstOutput
        await new Promise(resolve => setTimeout(resolve, 250))
        const echoMs = []
        for (let i = 0; i < 20; i++) {
          const character = String.fromCharCode(65 + i)
          const started = performance.now()
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(Error('PTY echo timeout')), 5000)
            listener = data => { if (data.includes(character)) { clearTimeout(timeout); resolve() } }
            api.input(id, character)
          })
          echoMs.push(performance.now() - started)
        }
        return { echoMs, kind: 'renderer IPC to local cmd PTY echo; excludes xterm paint' }
      } finally {
        dispose()
        clearTimeout(readyTimeout)
        await api.kill(id)
      }
    }, root)
  }
  let editorChecks
  if (process.argv.includes('--check-editor')) {
    const workspacePath = join(root, 'workspace')
    const filePath = join(workspacePath, 'sample.txt')
    await mkdir(workspacePath, { recursive: true })
    await writeFile(filePath, 'needle one\nneedle two\n')
    await writeFile(join(workspacePath, 'package.json'), JSON.stringify({ name: 'perf-fixture', scripts: { dev: 'node sample.js' } }))
    await page.evaluate(async path => {
      await window.electron.system.setLanguage('zh-CN')
      await window.electron.workspace.create({ name: 'Performance fixture', path })
    }, workspacePath)
    await page.reload()
    const row = page.locator('.ws').filter({ hasText: 'Performance fixture' }).first()
    await row.getByRole('button', { name: '更多操作' }).click()
    await page.getByRole('button', { name: '运行配置…', exact: true }).click()
    const modal = page.locator('.ws-config-modal')
    await modal.getByRole('button', { name: '高级编辑', exact: true }).click()
    await expect(modal.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 })
    const config = await page.evaluate(async path => {
      const result = await window.electron.project.createDefaultConfig(path, 'vite', 'Lazy editor verified')
      if (!result.success || !result.data) throw Error('No default config')
      return result.data
    }, workspacePath)
    // Exercise the real Monaco model -> onChange -> validation -> approval ->
    // disk path. Native EditContext keyboard auto-pairing is tested separately
    // by the file editor flow below, not by inserting an entire JSON document.
    const assets = join(directory, `${label}-app/renderer/assets`)
    const runtimeFile = (await readdir(assets)).find(name => /^monaco-runtime-.*\.js$/.test(name))
    if (!runtimeFile) throw Error('Missing Monaco runtime chunk')
    await page.evaluate(async ({ config, url }) => {
      const runtime = await import(url)
      const api = Object.values(runtime).find(value => typeof value?.getModels === 'function')
      const model = api?.getModels().find(model => model.getLanguageId() === 'json')
      if (!model) throw Error('Missing JSON model')
      model.setValue(JSON.stringify(config, null, 2))
    }, { config, url: pathToFileURL(join(assets, runtimeFile)).href })
    await expect(modal.getByTitle('保存运行配置', { exact: true })).toBeEnabled({ timeout: 10000 })
    await modal.getByTitle('保存运行配置', { exact: true }).click()
    const approve = modal.getByRole('button', { name: '批准', exact: true })
    await approve.waitFor({ timeout: 5000 }).catch(() => undefined)
    if (await approve.isVisible()) await approve.click()
    await expect.poll(async () => {
      try { return JSON.parse(await readFile(join(workspacePath, '.janusX', 'janusX.launch.json'), 'utf8')).projectName }
      catch { return null }
    }).toBe('Lazy editor verified')
    const editorUrl = new URL(page.url())
    editorUrl.searchParams.set('editorWindow', '1')
    editorUrl.searchParams.set('editorFile', filePath)
    editorUrl.searchParams.set('workspacePath', workspacePath)
    await page.goto(editorUrl.toString())
    const editor = page.locator('.monaco-editor').first()
    await expect(editor).toBeVisible({ timeout: 30_000 })
    await editor.click()
    await page.keyboard.press('Control+f')
    await expect(page.locator('.find-widget')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+a')
    await page.keyboard.insertText('saved after lazy loading\n')
    await page.keyboard.press('Control+s')
    await expect.poll(() => readFile(filePath, 'utf8')).toBe('saved after lazy loading\n')
    editorChecks = { advancedConfig: true, advancedConfigSave: true, fileOpen: true, find: true, editAndSave: true }
  }
  const result = { label, firstContentMs, profile: root, samples, editorChecks, terminalChecks }
  if (process.argv.includes('--checks-only')) {
    await writeFile(join(directory, `checks-${label}.json`), JSON.stringify(result, null, 2))
    console.log(JSON.stringify({ label, editorChecks, terminalChecks }))
  } else {
  const runsPath = join(directory, `desktop-${label}-runs.json`)
  let runs
  try { runs = JSON.parse(await readFile(runsPath, 'utf8')) }
  catch {
    try { runs = [JSON.parse(await readFile(join(directory, `desktop-${label}.json`), 'utf8'))] }
    catch { runs = [] }
  }
  runs.push(result)
  await writeFile(runsPath, JSON.stringify(runs, null, 2))
  await writeFile(join(directory, `desktop-${label}.json`), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ label, firstContentMs, samples: samples.map(s => ({ at: s.atSeconds,
    mainHeapMiB: s.main.memory.heapUsed / 2 ** 20, rendererHeapMiB: s.renderer.memory?.usedJSHeapSize / 2 ** 20,
    maxMainTimerLagMs: Math.max(0, ...s.main.lag),
    processMemory: s.main.metrics.map(p => ({ type: p.type, memory: p.memory })),
  })) }, null, 2))
  }
} finally {
  if (application) await application.close()
}
