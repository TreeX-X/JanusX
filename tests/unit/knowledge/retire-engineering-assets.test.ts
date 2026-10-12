import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
import { retireEngineeringAssets } from '../../../src/main/knowledge/retire-engineering-assets'
let root: string
const old = process.env.JANUSX_KNOWLEDGE_ROOT
async function put(path: string, content: string) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content) }
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'retire-engineering-')); process.env.JANUSX_KNOWLEDGE_ROOT = root })
afterEach(async () => { await rm(root, { recursive: true, force: true }); if (old === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT; else process.env.JANUSX_KNOWLEDGE_ROOT = old })
it('removes owned generation assets while preserving mixed personal rows, sources, audit and model resources byte-for-byte', async () => {
  for (const path of ['wiki/pages/a.md', 'wiki/pages-index.json', 'graph/edges.jsonl', 'indexes/graph-snapshot.json', 'processing/automation-tasks.json', 'processing/extraction/task.json']) await put(path, '{broken')
  const personal = '{"id":"personal","scope":"user","provenance":{"workspaceId":"project"}}\r\n'
  const unknown = '{damaged\n'
  await put('facts/facts.jsonl', '{"id":"old","scope":"project","provenance":{"workspaceId":"p"}}\n' + personal + unknown)
  const retained = ['observations/active/a.jsonl', 'audit/audit.jsonl', 'models/model.gguf', 'profile/overrides.json', 'blobs/a.gz']
  for (const path of retained) await put(path, 'keep\r\n')
  expect((await retireEngineeringAssets()).removed).toBe(7)
  expect(await readFile(join(root, 'facts/facts.jsonl'), 'utf8')).toBe(personal + unknown)
  for (const path of retained) expect(await readFile(join(root, path), 'utf8')).toBe('keep\r\n')
  expect((await retireEngineeringAssets()).removed).toBe(0)
})
it('refuses a project root and never follows linked generated directories', async () => {
  await mkdir(join(root, '.agents')); await expect(retireEngineeringAssets()).rejects.toThrow('project')
  await rm(join(root, '.agents'), { recursive: true })
  const outside = await mkdtemp(join(tmpdir(), 'retire-outside-'))
  try {
    await writeFile(join(outside, 'keep'), 'source')
    await symlink(outside, join(root, 'graph'), 'junction')
    expect((await retireEngineeringAssets()).retained).toContain('graph')
    expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('source')
  } finally { await rm(join(root, 'graph')); await rm(outside, { recursive: true, force: true }) }
})
