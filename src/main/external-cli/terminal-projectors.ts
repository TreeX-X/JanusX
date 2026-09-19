import { homedir } from 'os'
import { copyFile, mkdir, readdir, readFile, rm } from 'fs/promises'
import { basename, dirname, join } from 'path'
import type {
  ExternalCliToolId,
  TerminalApplyModelResult,
  TerminalModelState,
  TerminalModelToolId,
} from '../../shared/ipc/external-cli'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'

// Note: 各终端 model 键的按格式精简投影（owned-key 合并＋备份＋重读校验）——见 .agents/notes/implemented/feature/2026-09-18-terminal-tabs-per-format-projectors.md

/** 精简版仅管理 model 键的终端；janus 为内部绑定，claude 走既有凭证三元组，均不在此列。 */
export const MODEL_TERMINAL_IDS: readonly TerminalModelToolId[] = ['codex', 'opencode', 'pi']

export function isModelTerminal(toolId: string): toolId is TerminalModelToolId {
  return toolId === 'codex' || toolId === 'opencode' || toolId === 'pi'
}

const BACKUP_KEEP_COUNT = 10
const MAX_MODEL_LENGTH = 200

function backupPrefix(fileName: string): string {
  return `${fileName}.janusx-bak-`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stripJsonComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** 去 JSONC 尾逗号：字符串感知，`{"a": 1,}` 可读，字符串内的 `,}` 不动。 */
function stripTrailingCommas(value: string): string {
  let out = ''
  let index = 0
  const length = value.length
  while (index < length) {
    const char = value[index]!
    if (char === '"') {
      out += char
      index += 1
      while (index < length) {
        const current = value[index]!
        out += current
        if (current === '\\') {
          out += value[index + 1] ?? ''
          index += 2
          continue
        }
        index += 1
        if (current === '"') break
      }
      continue
    }
    if (char === ',') {
      let cursor = index + 1
      while (cursor < length && /\s/.test(value[cursor]!)) cursor += 1
      const next = value[cursor]
      if (next === '}' || next === ']') {
        index += 1
        continue
      }
    }
    out += char
    index += 1
  }
  return out
}

function parseLenientJson(raw: string): unknown {
  const text = raw.replace(/^\uFEFF/, '')
  if (!text.trim()) return {}
  return JSON.parse(stripTrailingCommas(stripJsonComments(text)))
}

/** TOML 顶层 `model` 读值：只看第一个表头之前的行，表内同名键不归本域管理。 */
export function readTomlTopLevelModel(text: string): string | undefined {
  const lines = text.split(/\r?\n/)
  let inLiteral: string | null = null
  for (const line of lines) {
    if (inLiteral) {
      const occurrences = line.split(inLiteral).length - 1
      if (occurrences % 2 === 1) inLiteral = null
      continue
    }
    const triple = line.match(/'''|"""/)
    if (triple) {
      const occurrences = line.split(triple[0]).length - 1
      if (occurrences % 2 === 1) {
        inLiteral = triple[0]
        continue
      }
    }
    if (/^\s*\[/.test(line)) break
    const match = line.match(/^\s*model\s*=\s*(.+?)\s*(?:#.*)?$/)
    if (match) {
      const raw = match[1]!.trim().replace(/,$/, '')
      if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        try {
          return JSON.parse(raw) as string
        } catch {
          return raw.slice(1, -1)
        }
      }
      return raw || undefined
    }
  }
  return undefined
}

/** TOML 顶层 `model` 写值：替换首个顶层行，否则插到首个表头之前（无表头则追尾），其余字节不动。 */
export function writeTomlTopLevelModel(text: string, model: string): string {
  const assignment = `model = ${JSON.stringify(model)}`
  const lines = text.split(/\r?\n/)
  let inLiteral: string | null = null
  let headerIdx = -1
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    if (inLiteral) {
      const occurrences = line.split(inLiteral).length - 1
      if (occurrences % 2 === 1) inLiteral = null
      continue
    }
    const triple = line.match(/'''|"""/)
    if (triple) {
      const occurrences = line.split(triple[0]).length - 1
      if (occurrences % 2 === 1) {
        inLiteral = triple[0]
        continue
      }
    }
    if (/^\s*\[/.test(line)) {
      headerIdx = index
      break
    }
    const match = line.match(/^(\s*)model\s*=.*$/)
    if (match) {
      lines[index] = `${match[1]}${assignment}`
      return lines.join('\n')
    }
  }
  const insertAt = headerIdx === -1 ? lines.length : headerIdx
  lines.splice(insertAt, 0, assignment)
  const next = lines.join('\n')
  return next.endsWith('\n') ? next : `${next}\n`
}

interface JsoncKeyLocation {
  valueStart: number
  valueEnd: number
}

/**
 * JSONC 顶层 `"key"` 定位：逐字符扫描字符串/注释/花括号深度，
 * 深度 1 的同名键才命中，provider 嵌套内的同名键不受影响。
 */
export function findJsoncTopLevelKey(text: string, key: string): JsoncKeyLocation | null {
  let depth = 0
  let index = 0
  const length = text.length
  const readStringToken = (start: number): { raw: string; end: number } | null => {
    // start 指向开引号
    let cursor = start + 1
    let out = ''
    while (cursor < length) {
      const char = text[cursor]!
      if (char === '\\') {
        out += char + (text[cursor + 1] ?? '')
        cursor += 2
        continue
      }
      if (char === '"') return { raw: out, end: cursor + 1 }
      if (char === '\n') return null
      out += char
      cursor += 1
    }
    return null
  }
  const skipWhitespace = (cursor: number): number => {
    while (cursor < length && /\s/.test(text[cursor]!)) cursor += 1
    return cursor
  }
  while (index < length) {
    const char = text[index]!
    if (char === '"') {
      const token = readStringToken(index)
      if (!token) {
        index += 1
        continue
      }
      let unescaped: string | null = null
      try {
        unescaped = JSON.parse(`"${token.raw}"`) as string
      } catch {
        unescaped = null
      }
      let cursor = skipWhitespace(token.end)
      if (unescaped === key && text[cursor] === ':' && depth === 1) {
        cursor = skipWhitespace(cursor + 1)
        if (text[cursor] === '"') {
          const value = readStringToken(cursor)
          if (value) return { valueStart: cursor, valueEnd: value.end }
          return null
        }
        // 非字符串值：取到行尾/逗号/闭括号为止整体替换
        let end = cursor
        let inStr = false
        while (end < length) {
          const current = text[end]!
          if (inStr) {
            if (current === '\\') {
              end += 2
              continue
            }
            if (current === '"') inStr = false
            end += 1
            continue
          }
          if (current === '"') {
            inStr = true
            end += 1
            continue
          }
          if (current === ',' || current === '}' || current === ']' || current === '\n') break
          end += 1
        }
        return { valueStart: cursor, valueEnd: end }
      }
      index = token.end
      continue
    }
    if (char === '/' && text[index + 1] === '/') {
      while (index < length && text[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && text[index + 1] === '*') {
      index += 2
      while (index < length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 2
      continue
    }
    if (char === '{' || char === '[') depth += 1
    else if (char === '}' || char === ']') depth = Math.max(0, depth - 1)
    index += 1
  }
  return null
}

/** JSONC 根对象定位：字符串与注释内的括号不参与深度计算。 */
function findJsoncRoot(text: string): { openAt: number; closeAt: number } | null {
  let depth = 0
  let openAt = -1
  let index = 0
  const length = text.length
  while (index < length) {
    const char = text[index]!
    if (char === '"') {
      index += 1
      while (index < length) {
        const current = text[index]!
        if (current === '\\') {
          index += 2
          continue
        }
        if (current === '"') break
        index += 1
      }
      index += 1
      continue
    }
    if (char === '/' && text[index + 1] === '/') {
      while (index < length && text[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && text[index + 1] === '*') {
      index += 2
      while (index < length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 2
      continue
    }
    if (char === '{') {
      if (depth === 0) openAt = index
      depth += 1
    } else if (char === '}') {
      depth = Math.max(0, depth - 1)
      if (depth === 0 && openAt !== -1) return { openAt, closeAt: index }
    }
    index += 1
  }
  return null
}

/** JSONC 顶层 `model` 写值：命中则替换值段，否则以前置逗号插入根对象尾（三种尾逗号形态均合法）。 */
export function writeJsoncTopLevelModel(text: string, key: string, model: string): string {
  const quoted = JSON.stringify(model)
  const hit = findJsoncTopLevelKey(text, key)
  if (hit) return `${text.slice(0, hit.valueStart)}${quoted}${text.slice(hit.valueEnd)}`
  const root = findJsoncRoot(text)
  if (!root) throw new Error('Config is not a JSON object.')
  const inner = stripJsonComments(text.slice(root.openAt + 1, root.closeAt)).trim()
  const insertion = inner === '' ? `"${key}": ${quoted}` : inner.endsWith(',') ? `"${key}": ${quoted}` : `, "${key}": ${quoted}`
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  return `${text.slice(0, root.closeAt).replace(/\s+$/, '')}${eol}  ${insertion}${eol}}${text.slice(root.closeAt + 1)}`
}

function validateModel(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) throw new Error('Model must not be empty.')
  if (trimmed.length > MAX_MODEL_LENGTH) throw new Error(`Model must be within ${MAX_MODEL_LENGTH} characters.`)
  return trimmed
}

export class TerminalProjectors {
  private readonly queue = new SerialQueue()

  constructor(private readonly homeDir: string = homedir()) {}

  /** opencode 沿用已存在的同名文件；都不存在时创建 `.json`。 */
  async configPathFor(tool: TerminalModelToolId): Promise<string> {
    if (tool === 'codex') return join(this.homeDir, '.codex', 'config.toml')
    if (tool === 'pi') return join(this.homeDir, '.pi', 'agent', 'settings.json')
    const json = join(this.homeDir, '.config', 'opencode', 'opencode.json')
    const jsonc = join(this.homeDir, '.config', 'opencode', 'opencode.jsonc')
    try {
      await readFile(jsonc, 'utf8')
      try {
        await readFile(json, 'utf8')
        return json
      } catch {
        return jsonc
      }
    } catch {
      return json
    }
  }

  private backupDirFor(configPath: string): string {
    return dirname(configPath)
  }

  private async snapshotLive(configPath: string): Promise<string> {
    const dir = this.backupDirFor(configPath)
    await mkdir(dir, { recursive: true })
    const backupPath = join(dir, `${backupPrefix(basename(configPath))}${Date.now()}`)
    await copyFile(configPath, backupPath)
    const entries = (await readdir(dir)).filter((name) => name.startsWith(backupPrefix(basename(configPath)))).sort()
    const overflow = entries.slice(0, Math.max(0, entries.length - BACKUP_KEEP_COUNT))
    await Promise.all(overflow.map((name) => rm(join(dir, name), { force: true })))
    return backupPath
  }

  private async newestBackup(configPath: string): Promise<string | null> {
    try {
      const entries = (await readdir(this.backupDirFor(configPath)))
        .filter((name) => name.startsWith(backupPrefix(basename(configPath))))
        .sort()
      const newest = entries[entries.length - 1]
      return newest ? join(this.backupDirFor(configPath), newest) : null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  private readModelFromText(tool: TerminalModelToolId, configPath: string, text: string): string | undefined {
    if (tool === 'codex') return readTomlTopLevelModel(text)
    const parsed: unknown = parseLenientJson(text)
    if (!isRecord(parsed)) throw new Error(`${configPath} must contain a JSON object`)
    if (tool === 'pi') return readString(parsed['defaultModel'])
    return readString(parsed['model'])
  }

  private writeModelIntoText(tool: TerminalModelToolId, configPath: string, text: string, model: string): string {
    if (tool === 'codex') return writeTomlTopLevelModel(text, model)
    if (tool === 'pi') {
      const parsed: unknown = text.trim() ? parseLenientJson(text) : {}
      if (!isRecord(parsed)) throw new Error(`${configPath} must contain a JSON object`)
      return `${JSON.stringify({ ...parsed, defaultModel: model }, null, 2)}\n`
    }
    if (configPath.endsWith('.jsonc')) return writeJsoncTopLevelModel(text, 'model', model)
    const parsed: unknown = text.trim() ? parseLenientJson(text) : {}
    if (!isRecord(parsed)) throw new Error(`${configPath} must contain a JSON object`)
    return `${JSON.stringify({ ...parsed, model }, null, 2)}\n`
  }

  async read(tool: TerminalModelToolId): Promise<TerminalModelState> {
    const configPath = await this.configPathFor(tool)
    try {
      const raw = await readFile(configPath, 'utf8')
      return { toolId: tool, configPath, exists: true, model: this.readModelFromText(tool, configPath, raw) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { toolId: tool, configPath, exists: false }
      }
      throw error
    }
  }

  /** 应用 model：备份→只改自有键→原子写→重读校验。并发调用串行，第二个看到第一个的写入。 */
  async apply(tool: TerminalModelToolId, model: string): Promise<TerminalApplyModelResult> {
    const wanted = validateModel(model)
    const configPath = await this.configPathFor(tool)
    return this.queue.run(async () => {
      let existed = true
      let current = ''
      try {
        current = await readFile(configPath, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        existed = false
      }
      const backupPath = existed ? await this.snapshotLive(configPath) : null
      await mkdir(dirname(configPath), { recursive: true })
      await writeFileAtomic(configPath, this.writeModelIntoText(tool, configPath, current, wanted))
      const verified = await readFile(configPath, 'utf8')
      if (this.readModelFromText(tool, configPath, verified) !== wanted) {
        throw new Error('Live config verification failed after apply.')
      }
      return { success: true, backupPath }
    })
  }

  /** 回滚到最近一次备份；无备份则明确报错，绝不凭空构造配置。 */
  async rollback(tool: TerminalModelToolId): Promise<{ backupPath: string }> {
    const configPath = await this.configPathFor(tool)
    return this.queue.run(async () => {
      const backupPath = await this.newestBackup(configPath)
      if (!backupPath) throw new Error('No backup found to roll back to.')
      const raw = await readFile(backupPath, 'utf8')
      // 备份内容先过一遍本格式解析，损坏的备份拒绝回写
      this.readModelFromText(tool, configPath, raw)
      await mkdir(dirname(configPath), { recursive: true })
      const restore = tool === 'codex' ? raw : (raw.endsWith('\n') ? raw : `${raw}\n`)
      await writeFileAtomic(configPath, restore)
      return { backupPath }
    })
  }
}

export const terminalProjectors = new TerminalProjectors()

export function terminalModelUnsupported(toolId: ExternalCliToolId): string {
  if (toolId === 'janus') return 'Janus keeps an internal binding only and owns no external file.'
  if (toolId === 'claude') return 'Claude Code syncs the full credential triple; use the credential sync action.'
  return 'Unsupported tool.'
}
