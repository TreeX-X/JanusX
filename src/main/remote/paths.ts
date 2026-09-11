/**
 * @file 远控数据路径（ToB M3）
 * @description `{userData}/janusx/remote/*`：bindings/dedupe/audit/secret。
 *              数据根支持注入，测试可覆盖（同 team paths 模式）。
 */

import { join } from 'path'
import { app } from 'electron'

let dataRootOverride: string | null = null

export function configureRemoteDataRoot(root: string | null): void {
  dataRootOverride = root
}

function dataRoot(): string {
  return dataRootOverride ?? join(app.getPath('userData'), 'janusx')
}

export function remoteDir(): string {
  return join(dataRoot(), 'remote')
}

export function remoteBindingsFile(): string {
  return join(remoteDir(), 'bindings.json')
}

export function remoteDedupeFile(): string {
  return join(remoteDir(), 'dedupe.json')
}

export function remoteAuditFile(): string {
  return join(remoteDir(), 'audit.jsonl')
}

export function remoteSecretFile(): string {
  return join(remoteDir(), 'secret')
}

/** 被控端 HTTPS 自签证书与私钥（0600 落盘，mDNS+HTTPS 双机远控用）。 */
export function remotePeerCertFile(): string {
  return join(remoteDir(), 'peer-cert.pem')
}

export function remotePeerKeyFile(): string {
  return join(remoteDir(), 'peer-key.pem')
}

/** 已确认指纹（TOFU）：`{ devices: { [deviceId]: { fingerprint, updatedAt } } }`。 */
export function remotePeerKnownHostsFile(): string {
  return join(remoteDir(), 'peer-known-hosts.json')
}
