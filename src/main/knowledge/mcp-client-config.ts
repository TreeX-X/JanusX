import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'
import { parse as parseToml } from 'smol-toml'
import { isDeepStrictEqual } from 'node:util'

export type McpConfigFormat = 'mcpServers' | 'opencode' | 'codex'
export interface McpLaunch { command: string; args: string[]; env?: Record<string, string> }
export const MCP_KEY = 'janusx-knowledge'
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const key = (format: McpConfigFormat) => format === 'opencode' ? 'mcp' : format === 'codex' ? 'mcp_servers' : format

function read(raw: string, format: McpConfigFormat): Record<string, unknown> {
  if (format === 'codex') return raw.trim() ? parseToml(raw) : {}
  const errors: ParseError[] = []
  const value = parse(raw || '{}', errors, { allowTrailingComma: true })
  if (errors.length || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid client configuration; repair the original file before registering')
  return value
}

export function clientEntry(raw: string, format: McpConfigFormat): unknown { return object(read(raw, format)[key(format)])[MCP_KEY] }
export function desiredEntry(format: McpConfigFormat, launch: McpLaunch): Record<string, unknown> {
  if (format === 'opencode') return { type: 'local', command: [launch.command, ...launch.args], enabled: true, ...(launch.env ? { environment: launch.env } : {}) }
  return { ...launch }
}

export function updateClientConfig(raw: string, format: McpConfigFormat, launch: McpLaunch): string {
  const data = read(raw, format)
  const parent = data[key(format)]
  if (parent !== undefined && (parent === null || typeof parent !== 'object' || Array.isArray(parent))) throw new Error('Invalid MCP server collection')
  if (format !== 'codex') {
    const source = raw || '{}'
    return applyEdits(source, modify(source, [key(format), MCP_KEY], desiredEntry(format, launch), { formattingOptions: { insertSpaces: true, tabSize: 2, eol: raw.includes('\r\n') ? '\r\n' : '\n' } }))
  }
  // Replace only this server's explicit tables; retain other tables and comments verbatim.
  const table = /^\s*\[mcp_servers\.(?:janusx-knowledge|"janusx-knowledge"|'janusx-knowledge')(?:\.[^\]]+)?\]\s*(?:#.*)?$/
  let owned = false
  let found = false
  const lines = raw.split(/\r?\n/)
  const kept = lines.filter(line => {
    if (/^\s*\[/.test(line)) { owned = table.test(line); if (owned) found = true }
    return !owned
  }).join('\n')
  if (object(parent)[MCP_KEY] !== undefined && !found) throw new Error('Existing inline MCP configuration needs manual conversion to a TOML table')
  const fields = [`[mcp_servers.${MCP_KEY}]`, `command = ${JSON.stringify(launch.command)}`, `args = ${JSON.stringify(launch.args)}`]
  if (launch.env) fields.push(`[mcp_servers.${MCP_KEY}.env]`, ...Object.entries(launch.env).map(([name, value]) => `${JSON.stringify(name)} = ${JSON.stringify(value)}`))
  const result = `${kept.trimEnd()}\n\n${fields.join('\n')}\n`
  const parsed = parseToml(result)
  const withoutEntry = (value: Record<string, unknown>) => ({ ...value, mcp_servers: Object.fromEntries(Object.entries(object(value.mcp_servers)).filter(([name]) => name !== MCP_KEY)) })
  if (!isDeepStrictEqual(withoutEntry(data), withoutEntry(parsed))) throw new Error('Cannot safely update this TOML layout; unrelated values would change')
  return raw.includes('\r\n') ? result.replace(/\n/g, '\r\n') : result
}
