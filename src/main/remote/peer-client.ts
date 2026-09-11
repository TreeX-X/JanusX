/**
 * @file 控制端 HTTPS 连接器（ToB 双机 LAN 远控）
 * @description 与 `RemotePeerServer` 对等的控制端：TLS 指纹钉死（TOFU，先确认后连接，
 *              中途变更直接硬失败）+ 复用同一账号会话 JWT 鉴权。实现既有
 *              `RemoteConnector` 接口，`RemoteClient`/单测回环逻辑原样复用。
 */

import { request as httpsRequest } from 'https'
import type { TLSSocket } from 'tls'
import { randomUUID } from 'crypto'
import type { CompanionCommand, CompanionResult } from '../companion/contracts'
import { TeamError } from '../team/service'
import { derFingerprint } from './cert'
import type { RemoteConnector } from './client'
import type { RemoteFileNode, RemoteTerminalView, RemoteWorkspaceView } from '../../shared/remote-view'

export interface PeerTarget {
  /** `https://<ip>:<port>`（不带路径）。 */
  baseUrl: string
  /** 自签证书 SHA256（小写 hex），首次连接由用户核对确认。 */
  fingerprint: string
}

export function normalizePeerBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) throw new TeamError('invalid-request', '远端地址不能为空')
  if (/^http:\/\//i.test(trimmed)) throw new TeamError('invalid-request', '远端地址必须为 HTTPS（形如 192.168.1.10:43717）')
  try {
    const url = new URL(/^https:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'https:' || !url.hostname) throw new Error('bad-url')
    return `https://${url.host}`
  } catch {
    throw new TeamError('invalid-request', '远端地址格式不正确（形如 192.168.1.10:43717）')
  }
}

interface PeerFetchOptions {
  token?: string
  deviceId?: string
  body?: unknown
  timeoutMs?: number
}

async function peerFetch(target: PeerTarget, method: string, path: string, opts: PeerFetchOptions = {}): Promise<unknown> {
  const base = new URL(target.baseUrl)
  const payload = opts.body === undefined ? null : Buffer.from(JSON.stringify(opts.body), 'utf8')
  const timeoutMs = opts.timeoutMs ?? 10_000
  return new Promise((resolve, reject) => {
    const fail = (error: unknown) => {
      if (error instanceof TeamError) reject(error)
      else if ((error as NodeJS.ErrnoException)?.code === 'ECONNREFUSED'
        || (error as NodeJS.ErrnoException)?.code === 'ENOTFOUND'
        || (error as NodeJS.ErrnoException)?.code === 'ETIMEDOUT') {
        reject(new TeamError('peer-unreachable', '找不到该设备（离线/地址错误/端口未开放）'))
      } else reject(new TeamError('peer-unreachable', error instanceof Error ? error.message : '连接远端失败'))
    }
    const req = httpsRequest({
      host: base.hostname,
      port: Number(base.port || 443),
      method,
      path,
      rejectUnauthorized: false,
      headers: {
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.deviceId ? { 'x-janusx-device-id': opts.deviceId } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        let body: unknown = null
        try {
          body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null
        } catch {
          reject(new TeamError('peer-unreachable', '远端返回非法数据'))
          return
        }
        const status = res.statusCode ?? 0
        if (status >= 200 && status < 300) {
          resolve(body)
          return
        }
        const record = (body ?? {}) as { code?: string; message?: string }
        reject(new TeamError(
          typeof record.code === 'string' ? record.code : 'peer-unreachable',
          typeof record.message === 'string' ? record.message : `远端错误（${status}）`,
        ))
      })
    })
    // 指纹钉死：TLS 握手完成即核对， mismatch 直接掐连接（业务请求发不出去）。
    const verifyFingerprint = (socket: TLSSocket) => {
      try {
        const cert = socket.getPeerCertificate()
        if (!cert || !cert.raw) {
          req.destroy(new TeamError('fingerprint-mismatch', '远端未出示证书，已中止连接'))
          return
        }
        const presented = derFingerprint(cert.raw)
        if (presented.toLowerCase() !== target.fingerprint.toLowerCase()) {
          req.destroy(new TeamError('fingerprint-mismatch', '远端证书指纹变化（疑似中间人），已中止连接'))
        }
      } catch (error) {
        req.destroy(error instanceof Error ? error : new Error('证书校验失败'))
      }
    }
    req.on('socket', (socket) => {
      const tlsSocket = socket as TLSSocket
      if (typeof tlsSocket.getPeerCertificate !== 'function') return
      if (tlsSocket.connecting) tlsSocket.once('secureConnect', () => verifyFingerprint(tlsSocket))
      else verifyFingerprint(tlsSocket)
    })
    req.on('timeout', () => req.destroy(new TeamError('peer-unreachable', '连接远端超时')))
    req.on('error', fail)
    req.setTimeout(timeoutMs)
    if (payload) req.write(payload)
    req.end()
  })
}

/** 控制端探针：连通性 + 协议版本（免鉴权，配对前检查用）。 */
export async function probePeer(target: PeerTarget): Promise<{ v: number }> {
  const body = (await peerFetch(target, 'GET', '/v1/info')) as { v?: number }
  if (!body || body.v !== 1) throw new TeamError('peer-unreachable', '远端版本不兼容')
  return { v: body.v }
}

/** 三视图连接器（远控显示契约）：被控主界面骨架的只读拉取。 */
export interface PeerViewConnector {
  workspaces(client: { deviceId: string; token: string }): Promise<RemoteWorkspaceView[]>
  files(client: { deviceId: string; token: string }, workspaceId: string, dir: string): Promise<RemoteFileNode[]>
  terminals(client: { deviceId: string; token: string }): Promise<RemoteTerminalView[]>
}

/** HTTPS 连接器：与回环连接器同接口，`RemoteClient` 可直接复用。 */
export function createHttpConnector(target: PeerTarget): RemoteConnector {
  const authed = (client: { deviceId: string; token: string }) => ({ token: client.token, deviceId: client.deviceId })
  return {
    redeem: (code, client) => peerFetch(target, 'POST', '/v1/redeem', {
      body: {
        code,
        clientDeviceId: client.deviceId,
        clientDeviceName: client.deviceName,
        clientToken: client.token,
      },
    }) as Promise<{ hostDeviceId: string; tenantId: string }>,
    listTerminals: (client) => peerFetch(target, 'GET', '/v1/terminals', authed(client)) as Promise<
      Array<{ terminalId: string; engine: string; workspaceId: string }>
    >,
    tail: (client, terminalId) => peerFetch(
      target,
      'GET',
      `/v1/terminals/${encodeURIComponent(terminalId)}/tail?sinceSeq=0`,
      authed(client),
    ) as Promise<{ data: string; seq: number }>,
    execute: (client, command: CompanionCommand, opts) => peerFetch(target, 'POST', '/v1/execute', {
      ...authed(client),
      body: {
        command,
        actionToken: opts?.actionToken,
        eventId: opts?.eventId ?? randomUUID(),
      },
    }) as Promise<CompanionResult>,
    createTerminal: (client, workspaceId, engine) => peerFetch(target, 'POST', '/v1/create-terminal', {
      ...authed(client),
      body: { workspaceId, engine },
    }) as Promise<CompanionResult>,
    killTerminal: (client, terminalId) => peerFetch(target, 'POST', '/v1/kill-terminal', {
      ...authed(client),
      body: { terminalId },
    }) as Promise<{ success: boolean; terminalId: string }>,
    resizeTerminal: (client, terminalId, cols, rows) => peerFetch(target, 'POST', '/v1/resize-terminal', {
      ...authed(client),
      body: { terminalId, cols, rows },
    }) as Promise<{ success: boolean; terminalId: string; cols: number; rows: number }>,
    view: {
      workspaces: (client) => peerFetch(target, 'GET', '/v1/view/workspaces', authed(client)) as Promise<RemoteWorkspaceView[]>,
      files: (client, workspaceId, dir) => peerFetch(
        target,
        'GET',
        `/v1/view/files?workspaceId=${encodeURIComponent(workspaceId)}&dir=${encodeURIComponent(dir)}`,
        authed(client),
      ) as Promise<RemoteFileNode[]>,
      terminals: (client) => peerFetch(target, 'GET', '/v1/view/terminals', authed(client)) as Promise<RemoteTerminalView[]>,
    },
  }
}
