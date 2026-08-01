/**
 * @file Blueprint 存储路径
 * @description 蓝图/索引/workspace 记录的磁盘路径解析（audit A1 自 blueprint-store 拆出）。
 *              数据根目录支持注入（组合根/测试可覆盖），默认取 electron userData。
 */

import { join } from 'path'
import { app } from 'electron'

const BLUEPRINTS_DIR = ['blueprints'] // 相对 .janusX
const WORKSPACES_DIR = ['workspaces'] // 相对 userData/janusx
const INDEX_FILE = 'index.json'

export const GLOBAL_BLUEPRINT_SCOPE = '__global__'

/** 数据根目录覆盖（audit A4 方向：路径注入解 electron 耦合，未注入时回落 app.getPath）。 */
let dataRootOverride: string | null = null

export function configureBlueprintDataRoot(root: string | null): void {
  dataRootOverride = root
}

function dataRoot(): string {
  return dataRootOverride ?? join(app.getPath('userData'), 'janusx')
}

export function blueprintsDir(): string {
  return join(dataRoot(), ...BLUEPRINTS_DIR)
}

export function indexFile(): string {
  return join(blueprintsDir(), INDEX_FILE)
}

export function blueprintFile(id: string): string {
  return join(blueprintsDir(), `${id}.json`)
}

export function workspacesDir(): string {
  return join(dataRoot(), ...WORKSPACES_DIR)
}

export function legacyIndexFile(workspace: string): string {
  return join(workspace, '.janusX', ...BLUEPRINTS_DIR, INDEX_FILE)
}

export function legacyBlueprintFile(workspace: string, id: string): string {
  return join(workspace, '.janusX', ...BLUEPRINTS_DIR, `${id}.json`)
}
