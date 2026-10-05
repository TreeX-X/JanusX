import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isKnowledgeMcpAllowed } from '../../../src/main/knowledge/mcp-access'
let root = ''
afterEach(async () => { vi.unstubAllEnvs(); if (root) await rm(root, { recursive: true, force: true }) })
it('reloads persisted switches between external requests and fails closed on missing or corrupt config', async () => {
  root = await mkdtemp(join(tmpdir(), 'janusx-mcp-policy-'))
  const path = join(root, 'config.json')
  vi.stubEnv('JANUSX_CONFIG_PATH', path)
  expect(await isKnowledgeMcpAllowed()).toBe(false)
  await writeFile(path, JSON.stringify({ experimentalFeatures: { knowledge: true }, knowledgeSettings: { enabled: true } }))
  expect(await isKnowledgeMcpAllowed()).toBe(true)
  await writeFile(path, JSON.stringify({ experimentalFeatures: { knowledge: false }, knowledgeSettings: { enabled: true } }))
  expect(await isKnowledgeMcpAllowed()).toBe(false)
  await writeFile(path, '{bad')
  expect(await isKnowledgeMcpAllowed()).toBe(false)
})
