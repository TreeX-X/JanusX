/**
 * @file 本地验证网关启动器（Electron 接线）
 * @description `JANUSX_WEB_TEST=1` 时在主进程起回环网关（默认 127.0.0.1:5789，
 *              可用 JANUSX_WEB_PORT 覆盖）。生产默认关闭；退出时停止。
 */

import { app } from 'electron'
import { WebTestGateway, WEB_TEST_DEFAULT_PORT, type WebPeerPort, type WebRemotePort } from './server'
import { getProductionRemoteHost } from '../remote/host'
import {
  discoverPeerHosts,
  getPeerConnections,
  getSharedView,
  peerHostStatus,
  startPeerHost,
  stopPeerHost,
} from '../remote/peer-runtime'
import { teamService } from '../team/service'

let gateway: WebTestGateway | null = null

/** 生产只读视图：与被控 peer HTTPS 共用实现（见 remote/view-ports.ts）。 */
const view = getSharedView()

export function isWebTestEnabled(): boolean {
  return process.env.JANUSX_WEB_TEST === '1'
}

export function webTestPort(): number {
  const raw = Number(process.env.JANUSX_WEB_PORT ?? WEB_TEST_DEFAULT_PORT)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : WEB_TEST_DEFAULT_PORT
}

export async function startWebTestGateway(): Promise<{ url: string } | null> {
  if (!isWebTestEnabled() || gateway) return null
  const host = await getProductionRemoteHost(teamService)
  // 网关只做透传：token 每次由浏览器传入，主进程不存会话原文。
  const remote: WebRemotePort = {
    issuePairingCode: (token) => host.issuePairingCode(token),
    redeemPairingCode: (input) => host.redeemPairingCode(input),
    listTerminals: (token, deviceId) => host.listTerminals(token, deviceId),
    getTail: (token, deviceId, terminalId) => host.getTail(token, deviceId, terminalId),
    execute: (input) => host.execute(input),
    issueActionToken: (input) => host.issueActionToken(input),
    listTrustedDevices: (token) => host.listTrustedDevices(token),
    revokeDevice: (token, deviceId) => host.revokeDevice(token, deviceId),
    createTerminal: (input) => host.createTerminal(input),
    killTerminal: (input) => host.killTerminal(input),
    resizeTerminal: (input) => host.resizeTerminal(input),
  }
  // 双机 peer 桥：mDNS 发现与 TLS 钉死留在主进程 Node 侧，浏览器只递参数。
  const peers = () => getPeerConnections()
  const peer: WebPeerPort = {
    hostStatus: () => Promise.resolve(peerHostStatus()),
    startHost: (token, deviceName) => startPeerHost(token, deviceName),
    stopHost: () => stopPeerHost(),
    discover: (timeoutMs) => discoverPeerHosts(timeoutMs),
    pair: (input) => peers().pair(input),
    listPeers: () => Promise.resolve(peers().listPeers()),
    listTerminals: (token, hostDeviceId) => peers().listTerminals(token, hostDeviceId),
    tail: (token, hostDeviceId, terminalId) => peers().tail(token, hostDeviceId, terminalId),
    execute: (token, hostDeviceId, command, opts) => peers().execute(token, hostDeviceId, command, opts),
    disconnect: (hostDeviceId) => Promise.resolve(peers().disconnect(hostDeviceId)),
    forget: (hostDeviceId) => peers().forget(hostDeviceId),
    viewWorkspaces: (token, hostDeviceId) => peers().viewWorkspaces(token, hostDeviceId),
    viewFiles: (token, hostDeviceId, workspaceId, dir) => peers().viewFiles(token, hostDeviceId, workspaceId, dir),
    viewTerminals: (token, hostDeviceId) => peers().viewTerminals(token, hostDeviceId),
    createTerminal: (token, hostDeviceId, workspaceId, engine) => peers().createTerminal(token, hostDeviceId, workspaceId, engine),
    killTerminal: (token, hostDeviceId, terminalId) => peers().killTerminal(token, hostDeviceId, terminalId),
    resizeTerminal: (token, hostDeviceId, terminalId, cols, rows) => peers().resizeTerminal(token, hostDeviceId, terminalId, cols, rows),
  }
  gateway = new WebTestGateway({
    team: teamService,
    remote,
    view,
    peer,
    rendererDevUrl: process.env.ELECTRON_RENDERER_URL || undefined,
    platform: process.platform,
  })
  const { port } = await gateway.start(webTestPort())
  const url = `http://127.0.0.1:${port}/`
  console.log(`[web-test] local loopback gateway listening (loopback only): ${url}`)
  app.once('will-quit', () => {
    void stopWebTestGateway()
  })
  return { url }
}

export async function stopWebTestGateway(): Promise<void> {
  const current = gateway
  gateway = null
  if (current) await current.stop().catch(() => undefined)
}
