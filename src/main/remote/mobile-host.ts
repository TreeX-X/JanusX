import { app, BrowserWindow, ipcMain } from 'electron'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { networkInterfaces } from 'node:os'
import QRCode from 'qrcode'
import { startSignaling } from './signaling'
import { MobileSession } from './mobile-session'
import { terminalManager, terminalOutputEvents } from '../terminal/manager'
import { createCompanionTerminal, submitCompanionTerminalLine } from '../ipc/terminal-handlers'
import { listRegisteredWorkspaces, resolveRegisteredWorkspace } from '../companion/workspace-registry'
import type { MobileHostOptions, MobileHostStatus } from '../../shared/ipc/remote'

const BRIDGE = 'remote:transport'
let window: BrowserWindow | undefined
let localSignal: Awaited<ReturnType<typeof startSignaling>> | undefined
let session: MobileSession | undefined
let state = '已关闭'
let qr: string | undefined
let starting = false
const workspacesRoot = () => join(app.getPath('userData'), 'janusx', 'workspaces')
const sendTransport = (data: unknown) => {
  if (window && !window.isDestroyed()) window.webContents.send(BRIDGE, data)
}
export async function mobileHostStatus(): Promise<MobileHostStatus> {
  return { running: Boolean(window), state, qr, expiresAt: session?.expiresAt, pending: session?.pending,
    devices: [...(session?.devices.values() ?? [])].map(({ id, name }) => ({ id, name })),
    workspaces: await listRegisteredWorkspaces(workspacesRoot()) }
}
function onOutput(id: string, data: string, seq: number) { session?.output(id, data, seq) }
export async function stopMobileHost(): Promise<void> {
  const old = window; window = undefined
  session?.disconnect(); session = undefined; qr = undefined; state = '已关闭'
  terminalOutputEvents.off('data', onOutput)
  if (old && !old.isDestroyed()) old.destroy()
  const signal = localSignal; localSignal = undefined
  await signal?.close()
}
export async function startMobileHost(options: MobileHostOptions): Promise<void> {
  if (starting) throw Error('远程正在开启')
  if (!options || typeof options.workspaceId !== 'string' || typeof options.signalUrl !== 'string' || typeof options.stunUrl !== 'string') throw Error('远程设置无效')
  starting = true
  try {
    await stopMobileHost()
    await resolveRegisteredWorkspace(workspacesRoot(), options.workspaceId)
    if (options.stunUrl && !/^stun:[^\s]+$/.test(options.stunUrl)) throw Error('只允许 STUN，不支持 TURN')
    let signalUrl = options.signalUrl.trim()
    if (!signalUrl) {
      localSignal = await startSignaling(43821, '0.0.0.0')
      const address = Object.values(networkInterfaces()).flat().find(a => a?.family === 'IPv4' && !a.internal)?.address ?? '127.0.0.1'
      signalUrl = `ws://${address}:${localSignal.port}/signal`
    }
    const parsed = new URL(signalUrl)
    if (!['ws:', 'wss:'].includes(parsed.protocol) || parsed.username || parsed.password || signalUrl.length > 2048) throw Error('请输入 ws:// 或 wss:// 信令地址')
    const invite = randomBytes(24).toString('hex'), secret = randomBytes(32).toString('hex')
    const expiresAt = Date.now() + 5 * 60 * 1000
    const active = new MobileSession(options.workspaceId, expiresAt, secret, {
      async create(id, workspaceId) {
        const record = await resolveRegisteredWorkspace(workspacesRoot(), workspaceId)
        const result = await createCompanionTerminal({ id, workspaceId, cwd: record.path, preset: 'claude',
          shell: process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash', cols: 80, rows: 30 })
        terminalManager.getInstance(id)?.pty.onExit(({ exitCode }) => active.exited(id, exitCode))
        return result
      },
      input: submitCompanionTerminalLine,
      keys: (id, data) => terminalManager.write(id, data),
      resize: (id, cols, rows) => terminalManager.resize(id, cols, rows),
      replay: id => terminalManager.getOutputReplay(id),
      alive: id => { const t = terminalManager.getInstance(id); return Boolean(t && t.status !== 'exited') },
    }, () => {})
    session = active
    terminalOutputEvents.on('data', onOutput)
    qr = await QRCode.toDataURL(JSON.stringify({ v: 1, signalUrl, invite, secret, stun: options.stunUrl, expiresAt }), { scale: 8, margin: 4, errorCorrectionLevel: 'M' })
    const hostWindow = new BrowserWindow({ show: false, webPreferences: {
      preload: join(app.getAppPath(), 'out/preload/remote.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    } })
    window = hostWindow
    hostWindow.webContents.on('preload-error', () => { state = '远程通信桥加载失败，请重启更新后的 JanusX' })
    hostWindow.webContents.on('render-process-gone', () => { state = '远程连接进程已退出，请关闭远程后重新开启' })
    hostWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    hostWindow.webContents.on('will-navigate', event => event.preventDefault())
    hostWindow.webContents.on('did-finish-load', () => sendTransport({ type: 'start', signalUrl: localSignal ? `ws://127.0.0.1:${localSignal.port}/signal` : signalUrl, invite, secret, stun: options.stunUrl }))
    hostWindow.on('closed', () => { if (window === hostWindow) void stopMobileHost() })
    state = '等待手机扫码'
    if (process.env.ELECTRON_RENDERER_URL) await hostWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/remote-host.html`)
    else await hostWindow.loadFile(join(app.getAppPath(), 'out/renderer/remote-host.html'))
  } catch (error) { await stopMobileHost(); throw error }
  finally { starting = false }
}
export function approveMobile(id: string): void { if (!session) throw Error('远程未开启'); session.approve(id) }
export function rejectMobile(): void { session?.reject() }
export function revokeMobile(id: string): void { session?.revoke(id) }
ipcMain.on(BRIDGE, (event, m) => {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !session) return
  if (m?.type === 'open') { session.connect(data => sendTransport({ type: 'send', data })); state = '直连成功，等待配对' }
  if (m?.type === 'close') { session.disconnect(); state = '连接已断开，可重连' }
  if (m?.type === 'status' && typeof m.text === 'string') state = m.text.slice(0, 300)
  if (m?.type === 'message' && typeof m.text === 'string') void session.receive(m.text)
})
app.on('before-quit', () => { void stopMobileHost() })
