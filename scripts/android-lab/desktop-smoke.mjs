import { _electron as electron, expect } from '@playwright/test'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
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
async function tap(text) {
  adb('shell', 'uiautomator', 'dump', '/sdcard/janus-smoke.xml')
  const xml = adb('shell', 'cat', '/sdcard/janus-smoke.xml')
  const node = xml.match(new RegExp(`<node[^>]*text="${text}"[^>]*>`))?.[0]
  const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
  if (!bounds) throw Error(`Android button missing: ${text}`)
  adb('shell', 'input', 'tap', String((+bounds[1] + +bounds[3]) >> 1), String((+bounds[2] + +bounds[4]) >> 1))
}
await build({ entryPoints: ['src/main/remote/signaling.ts'], outfile: join(root, 'signaling.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external' })
const { startSignaling } = await import(pathToFileURL(join(root, 'signaling.mjs')).href)
const signaling = await startSignaling(0, '0.0.0.0')
let app, page, terminalId
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
  await page.evaluate(options => window.electron.remote.start(options), { workspaceId: workspace.id, signalUrl: `ws://127.0.0.1:${signaling.port}/signal`, stunUrl: '' })
  await page.getByRole('button', { name: '远程已开启', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('信令已就绪', { timeout: 15000 })
  passed('Sandboxed CJS preload loaded; desktop joined signaling')
  const status = await page.evaluate(() => window.electron.remote.status())
  await writeFile(join(root, 'qr.png'), Buffer.from(status.qr.split(',')[1], 'base64'))
  const jdk = (await readdir(tools)).find(name => name.startsWith('jdk-17'))
  const core = await findJar(join(tools, 'gradle-cache/caches/modules-2/files-2.1/com.google.zxing/core/3.4.1'))
  execFileSync(join(tools, jdk, 'bin/java.exe'), ['--class-path', core, 'scripts/android-lab/ReadPairingQr.java', join(root, 'qr.png'), join(root, 'qr.json')])
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
  await tap('START CLAUDE CODE')
  await until(() => adb('logcat', '-d', '-s', 'JanusXP2P:I', '*:S').includes('\u5c1a\u672a\u83b7\u5f97\u7535\u8111\u6388\u6743'), 'unapproved operation rejected')
  passed('Unapproved Android cannot create a terminal')
  await page.getByRole('button', { name: '批准', exact: true }).click()
  await until(() => adb('logcat', '-d', '-s', 'JanusXP2P:I', '*:S').includes('RECV approved'), 'approval reaches Android')
  passed('Desktop approval reaches Android')
  await tap('START CLAUDE CODE')
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
  await page.evaluate(() => window.electron.remote.stop())
  await until(() => /Desktop left|SIGNAL closed/.test(adb('logcat', '-d', '-s', 'JanusXP2P:I', '*:S')), 'desktop stop visible on Android')
  passed('Desktop stop reaches Android')
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
  await app?.close()
  await signaling.close()
  console.log(`Evidence: ${root}`)
}
