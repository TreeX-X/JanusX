import { beforeAll, afterAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node'
import { WorkspaceSuggestionSources } from '../../src/main/blueprint/suggestions/sources'
import { WorkspaceSuggestions } from '../../src/main/blueprint/suggestions/workspace-service'
import { ReviewStore } from '../../src/main/blueprint/suggestions/store'
import { SuggestionService } from '../../src/main/blueprint/suggestions/service'

let root: string, client: Client, transport: StdioClientTransport, store: ReviewStore, sources: WorkspaceSuggestionSources
let a: string, b: string, uri: string, noteId: string, findingId: string
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'note-mcp-')); a = join(root, 'a'); b = join(root, 'b')
  await mkdir('.cache/note-mcp', { recursive: true })
  await build({ entryPoints: ['src/main/blueprint/note-mcp.ts'], outfile: '.cache/note-mcp/server.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' })
  noteId = randomUUID(); const repoId = randomUUID(); uri = `note://${repoId}/${noteId}`
  for (const [path, title] of [[a, 'Alpha'], [b, 'Beta']]) {
    await mkdir(join(path, '.agents/notes'), { recursive: true })
    await writeFile(join(path, '.agents/harness.json'), JSON.stringify({ schemaVersion: 1, repoId, name: title, profile: SUPPORTED_HARNESS_PROFILE }))
    await writeFile(join(path, '.agents/notes/module.md'), '---\n' + JSON.stringify({ schema: 'harness-note/2', id: noteId, kind: 'module', role: 'project', lifecycle: 'accepted', moduleState: 'partial', created: '2026-10-10', updated: '2026-10-10T00:00:00Z' }, null, 2) + `\n---\n\n# ${title}\n\n## Responsibility\n\nRead and maintain original Notes.\n\n## Design\n\nThe recovery design is pending.\n`)
  }
  sources = new WorkspaceSuggestionSources(); store = new ReviewStore(join(root, 'state/current-suggestions.sqlite'))
  const workspace = new WorkspaceSuggestions(new SuggestionService(store), sources)
  const context = await sources.context(a); const ticket = await workspace.begin(context, noteId, [])
  findingId = randomUUID()
  await workspace.publish(context, noteId, ticket.id, { findings: [{ id: findingId, category: 'insufficient', summary: 'Recovery needs a boundary', explanation: 'A recovery design is explicitly pending.', suggestion: 'Describe the recovery boundary.', citations: [{ path: '.agents/notes/module.md', quote: 'The recovery design is pending.' }], verification: 'not-configured' }], coverage: 'complete', limitations: [], resolvedFindings: [] })
  client = new Client({ name: 'independent-note-consumer', version: '1.0.0' })
  transport = new StdioClientTransport({ command: process.execPath, args: [resolve('.cache/note-mcp/server.mjs')], cwd: root, env: { ...process.env as Record<string,string>, JANUSX_NOTE_STATE_ROOT: join(root, 'state') }, stderr: 'pipe' })
  let stderr = ''
  transport.stderr?.on('data', data => { stderr += String(data) })
  try { await client.connect(transport) } catch { throw new Error('Note MCP startup: ' + stderr.slice(0, 4000)) }
}, 20000)
afterAll(async () => { await client?.close(); await transport?.close(); sources?.notes.unwatchAll(); store?.close(); await rm(root, { recursive: true, force: true }) })
const call = async (name: string, args: Record<string, unknown>) => {
  const response = await client.callTool({ name, arguments: args })
  const text = (response.content as Array<{ text: string }>)[0].text
  if (response.isError) throw new Error(text)
  return JSON.parse(text)
}
it('runs without a desktop or WorkflowX, uses explicit invocation roots and shared suggestions', async () => {
  const tools = (await client.listTools()).tools.map(tool => tool.name)
  expect(tools).toEqual(expect.arrayContaining(['note.list','note.read','note.write','note.init','note.context','note.suggestions','note.suggestions.close']))
  expect(tools.some(name => /review|generate/.test(name))).toBe(false)
  await expect(call('note.list', {})).rejects.toThrow('workspacePath')
  expect((await call('note.list', { workspacePath: a })).notes[0].title).toBe('Alpha')
  expect((await call('note.list', { workspacePath: b })).notes[0].title).toBe('Beta')
  const view = await call('note.suggestions', { workspacePath: a, noteId })
  expect(view.items[0].report.findings[0].id).toBe(findingId)
  expect((await call('note.suggestions', { workspacePath: b, noteId })).items).toEqual([])
  const note = await call('note.read', { workspacePath: a, uri })
  await call('note.write', { workspacePath: a, reason: 'Define the authorized recovery boundary', operations: [{ type: 'update', uri, expectedHash: note.expectedHash, sections: { Design: 'Recover pending work once after restart.' } }] })
  const updated = await call('note.read', { workspacePath: a, uri })
  expect(updated.markdown).toContain('Recover pending work once after restart.')
  const stale = await call('note.suggestions', { workspacePath: a, noteId })
  expect(stale.items[0].report.stale).toBe(true)
  await expect(call('note.suggestions.close', { workspacePath: a, noteId, branch: view.context.branch, reportRevision: view.items[0].reportRevision, findingIds: [findingId] })).rejects.toThrow()
  await call('note.suggestions.close', { workspacePath: a, noteId, branch: stale.context.branch, reportRevision: stale.items[0].reportRevision, findingIds: [findingId] })
  expect((await call('note.suggestions', { workspacePath: a, noteId })).items).toEqual([])
  expect((await call('note.context', { workspacePath: a, uris: [uri] })).notes[0].expectedHash).toBe(updated.expectedHash)
  expect((await call('note.read', { workspacePath: b, uri })).markdown).toContain('The recovery design is pending.')
})

it('reports missing context materials and provides a readable maintenance guide', async () => {
  const missing = uri.replace(noteId, randomUUID())
  const context = await call('note.context', { workspacePath: b, uris: [uri, missing] })
  expect(context.notes).toHaveLength(1)
  expect(context.unavailable).toEqual([{ uri: missing, reason: 'Source is absent or invalid' }])
  expect(context.continuation).toContain('expectedHash')
  const guide = await client.readResource({ uri: 'janusx-note://maintenance' })
  expect(guide.contents[0].text).toContain('note.suggestions')
})
