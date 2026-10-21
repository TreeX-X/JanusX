// Run an actual legacy Chromium engine against the complete offline assets.
// This is a renderer fixture; desktop-smoke.mjs owns real Claude/PTY evidence.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'esbuild'
import WebSocket from 'ws'

const root = await mkdtemp(resolve('artifacts/android-lab/terminal-compat-'))
const assets = resolve('apps/android-lab/app/build/generated/terminalAssets/terminal')
const executable = process.env.JANUSX_LEGACY_CHROME || resolve('artifacts/android-lab/legacy-chromium/chrome-win/chrome.exe')
const baseline = await build({ entryPoints: ['apps/android-lab/terminal/terminal.ts'], bundle: true, format: 'iife', target: 'chrome80', write: false })
const allowed = new Map([['index.html', 'text/html'], ['boot.js', 'application/javascript'], ['terminal.js', 'application/javascript'], ['terminal.css', 'text/css'], ['xterm.css', 'text/css'], ['favicon.svg', 'image/svg+xml']])
const server = createServer(async (request, response) => {
  const [variant, name] = (request.url || '').split('?')[0].split('/').filter(Boolean)
  if (!['baseline', 'fixed'].includes(variant) || !allowed.has(name)) { response.writeHead(404).end(); return }
  try {
    const content = variant === 'baseline' && name === 'terminal.js' ? baseline.outputFiles[0].contents : await readFile(join(assets, name))
    response.writeHead(200, { 'Content-Type': allowed.get(name) + '; charset=utf-8', 'Cache-Control': 'no-store' }).end(content)
  } catch { response.writeHead(500).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = spawn(executable, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${join(root, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const report = { scope: 'Legacy desktop Chromium renderer fixture; not Android or real CLI acceptance', checks: [], exceptions: [] }
let socket, nextId = 0
const waiting = new Map()
async function until(check, label) {
  for (let i = 0; i < 150; i++) { if (await check()) return; await delay(100) }
  throw Error('Timeout: ' + label)
}
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timeout = setTimeout(() => { waiting.delete(id); reject(Error('CDP timeout: ' + method)) }, 10000)
    waiting.set(id, { resolve, reject, timeout })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true })
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
const passed = text => { report.checks.push(text); console.log('PASS: ' + text) }
try {
  let port
  await until(async () => { try { port = (await readFile(join(root, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0]; return port } catch { return false } }, 'legacy browser debugging endpoint')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  socket.on('message', raw => {
    const message = JSON.parse(raw)
    if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    const pending = waiting.get(message.id)
    if (!pending) return
    clearTimeout(pending.timeout); waiting.delete(message.id)
    if (message.error) pending.reject(Error(message.error.message)); else pending.resolve(message.result)
  })
  report.browser = await command('Browser.getVersion')
  await command('Runtime.enable'); await command('Page.enable')
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__ready = false; window.__failed = ''; window.__statuses = [];
    window.AndroidTerminal = { ready: function () { window.__ready = true; },
      status: function (text) { window.__statuses.push(text); },
      failed: function (text) { window.__failed = text; }, resync: function () {} };
    // Also exercise initialization without newer global runtime conveniences.
    delete window.globalThis; delete Array.prototype.flatMap; delete window.queueMicrotask;
  ` })
  const origin = `http://127.0.0.1:${server.address().port}`
  await command('Page.navigate', { url: origin + '/baseline/index.html' })
  await until(() => evaluate('Boolean(window.__failed)'), 'baseline syntax failure')
  report.baselineError = await evaluate('window.__failed')
  assert.match(report.baselineError, /SyntaxError|Unexpected token/)
  assert.equal(await evaluate('window.__ready'), false)
  passed('Chrome 80 target reproduces the reported syntax failure before terminal readiness')
  await command('Page.navigate', { url: origin + '/fixed/index.html' })
  await until(() => evaluate('window.__ready === true'), 'compatible xterm ready')
  assert.equal(await evaluate('window.__failed'), '')
  passed('Shipped Chrome 58 target initializes xterm in the legacy engine without globalThis/flatMap')
  const replay = `window.mobileTerminal.select('fixture');
    window.mobileTerminal.receive({type:'replay-start',terminalId:'fixture',seq:1,cols:80,rows:24});
    window.mobileTerminal.receive({type:'replay-data',terminalId:'fixture',data:'\\x1b[2J\\x1b[H兼容显示 中文😀\\r\\nready'});
    window.mobileTerminal.receive({type:'replay-end',terminalId:'fixture',seq:1});
    window.mobileTerminal.receive({type:'output',terminalId:'fixture',seq:2,final:true,data:'\\r\\nLIVE OUTPUT'});`
  await evaluate(replay)
  await until(async () => (await evaluate("document.querySelector('.xterm-rows').textContent")).includes('LIVE OUTPUT'), 'replay and live output paint')
  assert.match(await evaluate("document.querySelector('.xterm-rows').textContent"), /兼容显示 中文😀/)
  await writeFile(join(root, 'legacy-screen.png'), Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  passed('ANSI replay, Chinese/emoji and subsequent live output paint in the legacy engine')
  await evaluate('window.__ready = false')
  await command('Page.reload')
  await until(() => evaluate('window.__ready === true'), 'renderer reload ready')
  await evaluate(replay)
  await until(async () => (await evaluate("document.querySelector('.xterm-rows').textContent")).includes('LIVE OUTPUT'), 'reload replay paint')
  assert.equal(await evaluate('window.__failed'), '')
  assert.equal(report.exceptions.length, 1, 'Only the deliberate baseline syntax error is expected')
  passed('Reloading the compatible renderer still initializes and paints replay/live output')
} catch (error) { report.error = String(error); process.exitCode = 1 }
finally {
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2))
  socket?.close(); browser.kill(); server.close()
  for (const pending of waiting.values()) clearTimeout(pending.timeout)
  console.log('Evidence: ' + root)
  if (report.error) console.error(report.error)
}
