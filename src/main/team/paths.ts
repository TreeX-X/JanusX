/**
 * @file 团队数据路径（ToB M2）
 * @description `{userData}/janusx/team/store.json` 单文件存储，小规模够用；
 *              数据根支持注入，测试可覆盖（同 blueprint-paths 模式）。
 */

import { join } from 'path'
import { app } from 'electron'

const TEAM_DIR = ['team']
const STORE_FILE = 'store.json'
const SECRET_FILE = 'secret'

let dataRootOverride: string | null = null

export function configureTeamDataRoot(root: string | null): void {
  dataRootOverride = root
}

function dataRoot(): string {
  return dataRootOverride ?? join(app.getPath('userData'), 'janusx')
}

export function teamDir(): string {
  return join(dataRoot(), ...TEAM_DIR)
}

export function teamStoreFile(): string {
  return join(teamDir(), STORE_FILE)
}

export function teamSecretFile(): string {
  return join(teamDir(), SECRET_FILE)
}
