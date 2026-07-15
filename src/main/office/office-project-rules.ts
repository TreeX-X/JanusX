import { mkdir, readFile, realpath, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export const OFFICE_RULE_START = '<!-- JANUSX:OFFICECLI:START -->'
export const OFFICE_RULE_END = '<!-- JANUSX:OFFICECLI:END -->'
export const OFFICE_MCP_START = '# JANUSX:OFFICECLI:MCP:START'
export const OFFICE_MCP_END = '# JANUSX:OFFICECLI:MCP:END'

export interface OfficeRulePreview { filePath: string; before: string; after: string; changed: boolean }

export const OFFICE_PROJECT_POLICY = [
  'For .docx, .xlsx, and .pptx changes, use the JanusX Office MCP tools or the verified officecli command.',
  'OfficeCLI edits can refresh an active JanusX preview through its resident watch/SSE session.',
  'Direct filesystem, Python, or copy-based Office writes are outside that live-refresh guarantee and require manual reload.',
  'This policy guides normal operation; unrestricted shell/filesystem access can bypass it.',
].join('\n')

function newlineOf(raw: string): '\r\n' | '\n' { return raw.includes('\r\n') ? '\r\n' : '\n' }

export function removeOfficeRuleBlock(raw: string): string {
  const start = raw.indexOf(OFFICE_RULE_START)
  if (start < 0) return raw
  const endMarker = raw.indexOf(OFFICE_RULE_END, start)
  if (endMarker < 0) throw new Error('Malformed JanusX Office rule block')
  let end = endMarker + OFFICE_RULE_END.length
  if (raw.slice(end, end + 2) === '\r\n') end += 2
  else if (raw[end] === '\n') end += 1
  return raw.slice(0, start) + raw.slice(end)
}

export function configureOfficeRuleText(raw: string): string {
  const clean = removeOfficeRuleBlock(raw)
  const newline = newlineOf(clean)
  return `${clean}${OFFICE_RULE_START}${newline}${OFFICE_PROJECT_POLICY.split('\n').join(newline)}${newline}${OFFICE_RULE_END}${newline}`
}

async function readOptional(filePath: string): Promise<string> {
  try { return await readFile(filePath, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

export async function previewOfficeProjectRules(workspace: string, remove = false): Promise<OfficeRulePreview> {
  const root = await realpath(workspace)
  const filePath = join(root, 'AGENTS.md')
  const before = await readOptional(filePath)
  const after = remove ? removeOfficeRuleBlock(before) : configureOfficeRuleText(before)
  return { filePath, before, after, changed: before !== after }
}

export async function applyOfficeProjectRules(preview: OfficeRulePreview, confirmed: boolean): Promise<void> {
  if (!confirmed) throw new Error('Explicit project-rule confirmation is required')
  if (!preview.changed) return
  if (await readOptional(preview.filePath) !== preview.before) throw new Error('Project rule file changed after preview')
  await mkdir(dirname(preview.filePath), { recursive: true })
  await writeFile(preview.filePath, preview.after, 'utf8')
}

export function configureCodexOfficeMcpText(raw: string): string {
  const clean = removeMarkedText(raw, OFFICE_MCP_START, OFFICE_MCP_END)
  if (/^\s*\[mcp_servers\.janusx-office\]\s*$/m.test(clean)) {
    throw new Error('An unmanaged janusx-office MCP configuration already exists')
  }
  const newline = newlineOf(clean)
  return `${clean}${OFFICE_MCP_START}${newline}[mcp_servers.janusx-office]${newline}command = "janusx-office-mcp"${newline}${OFFICE_MCP_END}${newline}`
}

export function removeCodexOfficeMcpText(raw: string): string {
  return removeMarkedText(raw, OFFICE_MCP_START, OFFICE_MCP_END)
}

function removeMarkedText(raw: string, startMarker: string, endMarker: string): string {
  const start = raw.indexOf(startMarker)
  if (start < 0) return raw
  const endMarkerIndex = raw.indexOf(endMarker, start)
  if (endMarkerIndex < 0) throw new Error(`Malformed managed block: ${startMarker}`)
  let end = endMarkerIndex + endMarker.length
  if (raw.slice(end, end + 2) === '\r\n') end += 2
  else if (raw[end] === '\n') end += 1
  return raw.slice(0, start) + raw.slice(end)
}

export async function previewCodexOfficeMcp(
  workspace: string,
  remove = false,
): Promise<OfficeRulePreview> {
  const root = await realpath(workspace)
  const filePath = join(root, '.codex', 'config.toml')
  const before = await readOptional(filePath)
  const after = remove ? removeCodexOfficeMcpText(before) : configureCodexOfficeMcpText(before)
  return { filePath, before, after, changed: before !== after }
}
