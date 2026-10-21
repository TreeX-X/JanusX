import { _electron as electron, expect } from '@playwright/test'
import { _android as android } from 'playwright'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { delimiter, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const artifacts = resolve('artifacts/android-lab')
await mkdir(artifacts, { recursive: true })
const root = await mkdtemp(join(artifacts, 'desktop-smoke-'))
const tools = process.env.JANUSX_ANDROID_TOOLS || 'D:/JanusX-Android'
const adbPath = join(tools, 'sdk/platform-tools/adb.exe')
const adb = (...args) => execFileSync(adbPath, ['-s', process.env.ANDROID_SERIAL || 'emulator-5554', ...args], { encoding: 'utf8' })
async function findJar(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name)
    if (item.isFile() && item.name.endsWith('.jar')) return path
    if (item.isDirectory()) { const result = await findJar(path); if (result) return result }
  }
}
async function until(check, label, timeout = 30000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await check()) return; await delay(500) }
  throw Error(`Timeout: ${label}`)
}
function dumpUi() {
  adb('shell', 'rm', '-f', '/sdcard/janus-smoke.xml')
  try { adb('shell', 'uiautomator', 'dump', '/sdcard/janus-smoke.xml') }
  catch (error) {
    // Some emulator images kill the UIAutomator process after writing the dump.
    if (!String(error.stdout).includes('UI hierchary dumped')) throw error
  }
  const xml = adb('shell', 'cat', '/sdcard/janus-smoke.xml')
  if (!xml.includes('<hierarchy') || !xml.includes('</hierarchy>')) throw Error('Incomplete Android UI dump')
  return xml
}
async function tap(text) {
  const xml = dumpUi()
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const node = xml.match(new RegExp(`<node[^>]*text="${escaped}"[^>]*>`))?.[0]
  const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
  if (!bounds) throw Error(`Android button missing: ${text}`)
  adb('shell', 'input', 'tap', String((+bounds[1] + +bounds[3]) >> 1), String((+bounds[2] + +bounds[4]) >> 1))
}
await build({ entryPoints: ['src/main/remote/signaling.ts'], outfile: join(root, 'signaling.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external' })
const { startSignaling } = await import(pathToFileURL(join(root, 'signaling.mjs')).href)
const signaling = await startSignaling(0, '0.0.0.0')
let app, page, terminalId, androidDevice
const report = { scope: 'Real Electron + Android emulator; local UDP, not Internet/optical scan validation', checks: [] }
const passed = name => { report.checks.push(name); console.log(`PASS: ${name}`) }
try {
  const env = { ...process.env, ELECTRON_RENDERER_URL: '', NODE_ENV: 'production', JANUSX_KNOWLEDGE_ROOT: join(root, 'knowledge') }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [resolve('.'), `--user-data-dir=${join(root, 'profile')}`], env, timeout: 30000 })
  page = await app.firstWindow()
  page.on('pageerror', error => console.error('Renderer:', error.message))
  await page.waitForFunction(() => Boolean(window.electron?.remote && window.electron?.workspace))
  await page.evaluate(() => localStorage.setItem('janusx:learning:v1', JSON.stringify({ version: 1, introduced: true })))
  await page.reload()
  const cwd = join(root, 'workspace')
  await mkdir(cwd)
  const workspace = await page.evaluate(path => window.electron.workspace.create({ name: 'Android pairing smoke', path }), cwd)
  const disabledError = await page.evaluate(async options => {
    try { await window.electron.remote.start(options); return '' } catch (error) { return String(error) }
  }, { workspaceId: workspace.id, signalUrl: `ws://127.0.0.1:${signaling.port}/signal`, stunUrl: '' })
  expect(disabledError).toContain('创新功能')
  await expect(page.getByRole('button', { name: '开启手机远程', exact: true })).toHaveCount(0)
  await page.evaluate(() => window.electron.experimental.update({ remoteControl: true }))
  await page.reload()
  await expect(page.getByRole('button', { name: /Android pairing smoke，拖动/ })).toBeVisible()
  await page.getByRole('button', { name: '开启手机远程', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '授权工作区' })).toHaveValue(workspace.id)
  passed('Remote feature defaults off, direct IPC is gated, selected workspace is the active workspace')
  await page.evaluate(options => window.electron.remote.start(options), { workspaceId: workspace.id, signalUrl: `ws://127.0.0.1:${signaling.port}/signal`, stunUrl: '' })
  await expect(page.getByRole('status').filter({ hasText: '信令已就绪' })).toBeVisible({ timeout: 15000 })
  passed('Sandboxed CJS preload loaded; desktop joined signaling')
  const status = await page.evaluate(() => window.electron.remote.status())
  await writeFile(join(root, 'qr.png'), Buffer.from(status.qr.split(',')[1], 'base64'))
  const jdk = (await readdir(tools)).find(name => name.startsWith('jdk-17'))
  const core = await findJar(join(tools, 'gradle-cache/caches/modules-2/files-2.1/com.google.zxing/core/3.4.1'))
  const decoder = join(root, 'qr-decoder')
  await mkdir(decoder)
  execFileSync(join(tools, jdk, 'bin/javac.exe'), ['-encoding', 'UTF-8', '--class-path', core, '-d', decoder, 'scripts/android-lab/ReadPairingQr.java'])
  execFileSync(join(tools, jdk, 'bin/java.exe'), ['--class-path', core + delimiter + decoder, 'ReadPairingQr', join(root, 'qr.png'), join(root, 'qr.json')])
  const qr = JSON.parse(await readFile(join(root, 'qr.json'), 'utf8'))
  qr.signalUrl = `ws://10.0.2.2:${signaling.port}/signal`
  const quoted = "'" + JSON.stringify(qr).replaceAll("'", "'\\''") + "'"
  adb('install', '-r', resolve('apps/android-lab/app/build/outputs/apk/debug/app-debug.apk'))
  adb('shell', 'am', 'force-stop', 'com.janusx.p2plab')
  adb('logcat', '-c')
  adb('shell', 'am', 'start', '-n', 'com.janusx.p2plab/.MainActivity', '--es', 'invite', quoted, '--ez', 'autoconnect', 'true')
  await until(async () => Boolean((await page.evaluate(() => window.electron.remote.status())).pending), 'Android pending approval')
  await expect(page.getByText('设备申请：Android', { exact: false })).toBeVisible({ timeout: 5000 })
  passed('Authenticated SDP, UDP DataChannel and pending approval appear automatically')
  expect(dumpUi()).toMatch(/text="新建 Claude"[^>]*enabled="false"/)
  passed('Unapproved Android disables terminal creation')
  await page.getByRole('button', { name: '批准', exact: true }).click()
  await until(() => adb('logcat', '-d', '-s', 'JanusXP2P:I', '*:S').includes('RECV approved'), 'approval reaches Android')
  passed('Desktop approval reaches Android')
  await tap('新建 Claude')
  await until(() => {
    terminalId = adb('logcat', '-d', '-s', 'JanusXP2P:I', '*:S').match(/TERMINAL created ([a-f0-9-]+) pid=(\d+)/)?.[1]
    return Boolean(terminalId)
  }, 'real terminal creation', 60000)
  await until(() => /RECV (output|replay-data)/.test(adb('logcat', '-d', '-s', 'JanusXP2P:I', '*:S')), 'terminal output')
  let replay
  await until(async () => {
    replay = await page.evaluate(id => window.electron.terminal.replay(id), terminalId)
    const text = replay.data.replace(/\x1b\][^\x07]*?(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    return /Claude\s*Code|Anthropic|Welcome to Claude|Do you trust|trust this folder/i.test(text)
  }, 'actual Claude Code startup output', 60000)
  report.terminal = { id: terminalId, replayBytes: Buffer.byteLength(replay.data), seq: replay.seq, claudeStartupObserved: true }
  await writeFile(join(root, 'terminal-startup.txt'), replay.data)
  passed('Android creates real desktop Claude terminal and receives replay/output')
  await expect(page.locator(`[data-sidebar-terminal="${terminalId}"]`)).toBeVisible()
  await expect(page.locator('.cli-terminal .xterm')).toBeVisible()
  await expect(page.getByText('手机已连接 · 1 个远程终端', { exact: true })).toBeVisible()
  passed('Phone-created Claude terminal appears in desktop sidebar, terminal pane and live status')
  androidDevice = (await android.devices()).find(d => d.serial() === (process.env.ANDROID_SERIAL || 'emulator-5554'))
  const webView = await androidDevice.webView({ pkg: 'com.janusx.p2plab' })
  const androidPage = await webView.page()
  await androidPage.waitForFunction(() => Boolean(window.mobileTerminal))
  await until(async () => /Claude\s*Code|Anthropic|Welcome|trust/i.test(await androidPage.locator('.xterm-rows').innerText()), 'actual ANSI screen painted on Android', 30000)
  const painted = await androidPage.locator('.xterm-rows').innerText()
  expect(painted).not.toContain('\x1b')
  expect(painted).not.toMatch(/RECV output|RECV replay/)
  const fits = await androidPage.evaluate(() => {
    const viewport = document.getElementById('viewport')
    const surface = document.getElementById('surface')
    return surface.getBoundingClientRect().width <= viewport.clientWidth
  })
  expect(fits).toBe(true)
  await tap('A+')
  await until(async () => await androidPage.evaluate(() => document.getElementById('surface').getBoundingClientRect().width > document.getElementById('viewport').clientWidth), 'readable font supports horizontal pan')
  await tap('适宽')
  await until(async () => await androidPage.evaluate(() => document.getElementById('surface').getBoundingClientRect().width <= document.getElementById('viewport').clientWidth), 'fit-width restores complete screen')
  passed('Phone shows complete terminal width and supports larger text with horizontal pan')
  await writeFile(join(root, 'android-screen.txt'), painted)
  adb('shell', 'screencap', '-p', '/sdcard/janus-terminal.png')
  adb('pull', '/sdcard/janus-terminal.png', join(root, 'android-terminal.png'))
  await page.screenshot({ path: join(root, 'desktop-terminal.png') })
  passed('Bundled offline xterm paints real Claude screen without control codes or connection logs')
  await androidPage.evaluate(id => {
    window.mobileTerminal.receive({ type: 'replay-start', terminalId: id, cols: 80, rows: 24, seq: 100 })
    window.mobileTerminal.receive({ type: 'replay-data', terminalId: id, data: '\x1b[2J\x1b[Hdiscard\r\x1b[' })
    window.mobileTerminal.receive({ type: 'replay-data', terminalId: id, data: '2K中文😀\r\nready' })
    window.mobileTerminal.receive({ type: 'replay-end', terminalId: id, seq: 100 })
  }, terminalId)
  await until(async () => (await androidPage.locator('.xterm-rows').innerText()).includes('中文😀'), 'split VT and Unicode rendering')
  expect(await androidPage.locator('.xterm-rows').innerText()).not.toContain('discard')
  await tap('同步')
  await until(async () => /Claude\s*Code|Anthropic|Welcome|trust/i.test(await androidPage.locator('.xterm-rows').innerText()), 'resync restores real terminal after rendering fixture')
  passed('VT rendering fixture handles split erase/cursor sequences and Chinese/emoji, then restores real output')
  await tap('断开'); await tap('连接')
  await until(() => adb('logcat', '-d', '-s', 'JanusXP2P:I', '*:S').match(/RECV approved/g)?.length >= 2, 'device reconnect approved')
  await until(async () => /Claude\s*Code|Anthropic|Welcome|trust/i.test(await androidPage.locator('.xterm-rows').innerText()), 'same terminal restored on phone')
  expect((await page.evaluate(() => window.electron.remote.status())).terminals.map(t => t.id)).toEqual([terminalId])
  passed('Reconnect restores the same terminal and screen without creating another process')
  await page.evaluate(() => window.electron.experimental.update({ remoteControl: false }))
  expect((await page.evaluate(() => window.electron.remote.status())).running).toBe(false)
  await until(() => /Desktop left|SIGNAL closed/.test(adb('logcat', '-d', '-s', 'JanusXP2P:I', '*:S')), 'desktop stop visible on Android')
  expect((await page.evaluate(id => window.electron.terminal.replay(id), terminalId)).data.length).toBeGreaterThan(0)
  await page.reload()
  await expect(page.getByRole('button', { name: '开启手机远程', exact: true })).toHaveCount(0)
  passed('Disabling the feature disconnects Android, hides the entry and preserves the desktop terminal')
} catch (error) {
  report.error = String(error)
  console.error(error)
  process.exitCode = 1
} finally {
  if (terminalId && page) {
    const replay = await page.evaluate(id => window.electron.terminal.replay(id), terminalId).catch(() => null)
    if (replay) await writeFile(join(root, 'terminal-startup.txt'), replay.data)
  }
  await writeFile(join(root, 'android.log'), adb('logcat', '-d', '-s', 'JanusXP2P:I', 'AndroidRuntime:E', '*:S'))
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2))
  if (terminalId && page) await page.evaluate(id => window.electron.terminal.kill(id), terminalId).catch(() => {})
  adb('shell', 'am', 'force-stop', 'com.janusx.p2plab')
  await androidDevice?.close()
  await app?.close()
  await signaling.close()
  console.log(`Evidence: ${root}`)
}
