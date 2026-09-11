/**
 * @file 控制端已知指纹（TOFU，ToB 双机 LAN 远控）
 * @description 首次配对由用户核对指纹并落盘；同设备指纹变化直接硬失败
 *              （`fingerprint-mismatch`），用户需显式遗忘后重认。
 *              文件损坏时 fail-closed：拒绝连接而不是跳过校验。
 */

import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { TeamError } from '../team/service'
import { remotePeerKnownHostsFile } from './paths'

interface KnownHostsFile {
  devices: Record<string, { fingerprint: string; updatedAt: string }>
}

export class PeerKnownHosts {
  constructor(private readonly file = remotePeerKnownHostsFile()) {}

  private async load(): Promise<KnownHostsFile> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as KnownHostsFile
      if (!parsed || typeof parsed !== 'object' || !parsed.devices || typeof parsed.devices !== 'object') {
        throw new TeamError('fingerprint-mismatch', '已知指纹文件损坏，已中止连接')
      }
      return parsed
    } catch (error) {
      if (error instanceof TeamError) throw error
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { devices: {} }
      throw new TeamError('fingerprint-mismatch', '已知指纹文件损坏，已中止连接')
    }
  }

  known(deviceId: string): Promise<string | null> {
    return this.load().then((file) => file.devices[deviceId]?.fingerprint ?? null)
  }

  /**
   * 校验并记忆：无记录则记下（调用方已让用户核对过）；有记录不一致则抛错。
   * @returns 'remembered' 首次记忆，'matched' 与历史一致。
   */
  async checkOrRemember(deviceId: string, fingerprint: string, nowIso = new Date().toISOString()): Promise<'remembered' | 'matched'> {
    const file = await this.load()
    const previous = file.devices[deviceId]?.fingerprint
    if (previous && previous.toLowerCase() !== fingerprint.toLowerCase()) {
      throw new TeamError('fingerprint-mismatch', '该设备证书指纹与上次不一致，已中止连接（如重装过对方，请先遗忘该设备）')
    }
    if (!previous) {
      file.devices[deviceId] = { fingerprint: fingerprint.toLowerCase(), updatedAt: nowIso }
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(this.file, JSON.stringify(file, null, 2), { encoding: 'utf8', mode: 0o600 })
      return 'remembered'
    }
    return 'matched'
  }

  async forget(deviceId: string): Promise<void> {
    const file = await this.load()
    if (file.devices[deviceId]) {
      delete file.devices[deviceId]
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(this.file, JSON.stringify(file, null, 2), { encoding: 'utf8', mode: 0o600 })
    }
  }
}
