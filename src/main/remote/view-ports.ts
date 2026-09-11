/**
 * @file 本机只读视图数据源（远控显示契约的生产实现）
 * @description 工作区摘要 + 文件树一层 + 终端状态，形状见 `shared/remote-view.ts`。
 *              绝对路径只在主进程内解析：客户端永远只见工作区 id 与相对路径；
 *              目录参数做越界归一化，`..`/绝对路径一律拒绝。
 *              被控 peer HTTPS 与本地 Web 网关共用同一实现，保证两端同形。
 */

import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'
import type {
  RemoteFileNode,
  RemoteTerminalView,
  RemoteWorkspaceView,
} from '../../shared/remote-view'

/** 与桌面 filetree 一致：仅隐藏这两项，其余点文件照常显示。 */
const HIDDEN_FILETREE_ENTRIES = new Set(['.git', '.janusX'])

export interface LocalViewPorts {
  listWorkspaceViews(): Promise<RemoteWorkspaceView[]>
  /** relDir 为相对路径（'' 即根）；越界/非法一律拒绝。 */
  listFileNodes(workspaceId: string, relDir: string): Promise<RemoteFileNode[]>
  listTerminalViews(): Promise<RemoteTerminalView[]>
  getTerminalReplay(terminalId: string): Promise<{ data: string; seq: number } | null>
}

export interface LocalViewDeps {
  workspacesDir: string
  listTerminalInstances(): Array<{
    id: string
    workspaceId: string
    status: 'idle' | 'running' | 'exited'
    outputSeq: number
  }>
  getOutputReplay(terminalId: string): { data: string; seq: number } | null
}

interface WorkspaceRecord {
  id: string
  name: string
  path: string
}

async function readWorkspaceRecords(workspacesDir: string): Promise<WorkspaceRecord[]> {
  try {
    const files = await readdir(workspacesDir)
    const records: WorkspaceRecord[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const parsed = JSON.parse(await readFile(join(workspacesDir, file), 'utf-8')) as {
          id?: unknown
          name?: unknown
          path?: unknown
        }
        if (typeof parsed.id === 'string' && typeof parsed.name === 'string' && typeof parsed.path === 'string') {
          records.push({ id: parsed.id, name: parsed.name, path: parsed.path })
        }
      } catch {
        /* 单条损坏跳过 */
      }
    }
    return records
  } catch {
    return []
  }
}

/** 相对目录归一化：只允许工作区内的 posix 相对路径，越界一律拒绝。 */
export function normalizeRelDir(raw: string): string {
  const cleaned = raw.replace(/\\/g, '/').trim().replace(/^\/+/, '')
  if (!cleaned) return ''
  const parts = cleaned.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) {
    throw Object.assign(new Error('目录越界'), { code: 'forbidden' })
  }
  return parts.join('/')
}

function segments(dir: string): string[] {
  return dir ? dir.split('/').filter(Boolean) : []
}

/** 与桌面 handlers.ts 同规则：批量问 git，失败即全不忽略。 */
async function getGitIgnoredPaths(rootPath: string, paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set()
  return new Promise((resolve) => {
    let output = ''
    let settled = false
    const finish = (ignored: Set<string>) => {
      if (settled) return
      settled = true
      resolve(ignored)
    }
    let command
    try {
      command = spawn('git', ['check-ignore', '--no-index', '--stdin', '-z'], {
        cwd: rootPath,
        windowsHide: true,
      })
    } catch {
      finish(new Set())
      return
    }
    command.stdout.setEncoding('utf8')
    command.stdout.on('data', (chunk: string) => {
      output += chunk
    })
    command.on('error', () => finish(new Set()))
    command.on('close', () => {
      finish(new Set(output.split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/').replace(/\/$/, ''))))
    })
    command.stdin.end(paths.join('\0') + '\0')
  })
}

export function createLocalViewPorts(deps: LocalViewDeps): LocalViewPorts {
  return {
    async listWorkspaceViews() {
      const [records, instances] = await Promise.all([
        readWorkspaceRecords(deps.workspacesDir),
        Promise.resolve(deps.listTerminalInstances()),
      ])
      const counts = new Map<string, number>()
      for (const t of instances) counts.set(t.workspaceId, (counts.get(t.workspaceId) ?? 0) + 1)
      return records.map((r) => ({ id: r.id, name: r.name, terminalCount: counts.get(r.id) ?? 0 }))
    },

    async listFileNodes(workspaceId, relDir) {
      const records = await readWorkspaceRecords(deps.workspacesDir)
      const record = records.find((r) => r.id === workspaceId)
      if (!record) throw Object.assign(new Error('工作区不存在'), { code: 'not-found' })
      const dir = normalizeRelDir(relDir)
      const target = join(record.path, ...segments(dir))
      let entries
      try {
        entries = await readdir(target, { withFileTypes: true })
      } catch {
        throw Object.assign(new Error('目录不可读'), { code: 'not-found' })
      }
      const nodes: RemoteFileNode[] = []
      const candidates = entries
        .filter((entry) => !HIDDEN_FILETREE_ENTRIES.has(entry.name))
        .map((entry) => (dir ? `${dir}/${entry.name}` : entry.name))
      const ignored = await getGitIgnoredPaths(record.path, candidates)
      for (const entry of entries) {
        if (HIDDEN_FILETREE_ENTRIES.has(entry.name)) continue
        const relPath = dir ? `${dir}/${entry.name}` : entry.name
        const isGitIgnored = ignored.has(relPath.replace(/\/$/, ''))
        if (entry.isDirectory()) {
          let hasChildren = false
          try {
            hasChildren = (await readdir(join(target, entry.name))).length > 0
          } catch {
            hasChildren = false
          }
          nodes.push({ name: entry.name, relPath, type: 'directory', hasChildren, isGitIgnored })
        } else if (entry.isFile()) {
          nodes.push({ name: entry.name, relPath, type: 'file', hasChildren: false, isGitIgnored })
        }
      }
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      })
      return nodes
    },

    async listTerminalViews() {
      return deps.listTerminalInstances().map((t) => ({
        terminalId: t.id,
        workspaceId: t.workspaceId,
        status: t.status,
        seq: t.outputSeq,
      }))
    },

    async getTerminalReplay(terminalId) {
      return deps.getOutputReplay(terminalId)
    },
  }
}
