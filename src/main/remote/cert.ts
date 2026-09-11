/**
 * @file 被控端 HTTPS 自签证书（ToB 双机 LAN 远控）
 * @description 首次启动时生成 2048 位自签证书并 0600 落盘，后续复用；
 *              指纹为证书 PEM 的 SHA256，配对时由控制端确认（防 MITM）。
 *              同账号身份鉴权仍走团队会话 JWT，本证书只解决信道加密。
 */

import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'
import selfsigned from 'selfsigned'
import { remotePeerCertFile, remotePeerKeyFile } from './paths'

export interface PeerCert {
  key: string
  cert: string
  /** 证书 PEM 的 SHA256 hex，控制端首次连接时展示确认。 */
  fingerprint: string
}

/** PEM 证书转 DER（与 TLS 对端 `getPeerCertificate().raw` 同一字节序列，指纹两端可比）。 */
export function certDer(certPem: string): Buffer {
  const b64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '')
  return Buffer.from(b64, 'base64')
}

export function certFingerprint(certPem: string): string {
  return createHash('sha256').update(certDer(certPem)).digest('hex')
}

/** DER 字节的指纹（控制端验签用，与 `certFingerprint` 同值）。 */
export function derFingerprint(der: Buffer): string {
  return createHash('sha256').update(der).digest('hex')
}

/** 指纹展示：`abcd1234…wxyz` 缩写，完整值放详情/复制。 */
export function shortFingerprint(fingerprint: string): string {
  if (fingerprint.length <= 16) return fingerprint
  return `${fingerprint.slice(0, 8)}…${fingerprint.slice(-4)}`
}

export async function loadOrCreatePeerCert(options: {
  certFile?: string
  keyFile?: string
} = {}): Promise<PeerCert> {
  const certFile = options.certFile ?? remotePeerCertFile()
  const keyFile = options.keyFile ?? remotePeerKeyFile()
  try {
    const [cert, key] = await Promise.all([
      readFile(certFile, 'utf8'),
      readFile(keyFile, 'utf8'),
    ])
    if (cert.includes('BEGIN CERTIFICATE') && key.includes('PRIVATE KEY')) {
      return { key, cert, fingerprint: certFingerprint(cert) }
    }
  } catch {
    /* 不存在或损坏则重新生成 */
  }
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'JanusX Remote' }],
    {
      keySize: 2048,
      algorithm: 'sha256',
      notAfterDate: new Date(Date.now() + 825 * 24 * 60 * 60 * 1000),
    },
  )
  await mkdir(dirname(certFile), { recursive: true })
  await writeFile(certFile, pems.cert, { encoding: 'utf8', mode: 0o600 })
  await writeFile(keyFile, pems.private, { encoding: 'utf8', mode: 0o600 })
  return { key: pems.private, cert: pems.cert, fingerprint: certFingerprint(pems.cert) }
}
