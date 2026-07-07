import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { knowledgeContractService } from '../../../src/main/knowledge/contract-service'

describe('KnowledgeContractService', () => {
  let workspacePath: string
  let knowledgeRoot: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    workspacePath = await mkdtemp(join(tmpdir(), 'janusx-knowledge-'))
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-global-knowledge-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
  })

  afterEach(async () => {
    await rm(workspacePath, { recursive: true, force: true })
    await rm(knowledgeRoot, { recursive: true, force: true })
    if (previousKnowledgeRoot === undefined) {
      delete process.env.JANUSX_KNOWLEDGE_ROOT
    } else {
      process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    }
  })

  it('returns a stable contracts snapshot', () => {
    const contracts = knowledgeContractService.getContracts()
    expect(contracts.schema.status).toBe('implemented')
    expect(contracts.storage.rootDirName).toBe('global')
    expect(contracts.writePolicy.requiredProvenanceFields).toContain('workspaceId')
  })

  it('bootstraps the global knowledge directory tree', async () => {
    const result = await knowledgeContractService.bootstrapWorkspace(workspacePath)

    expect(result.knowledgeRoot).toBe(knowledgeRoot)
    expect(result.createdFiles.length).toBeGreaterThan(0)

    const schemaJson = await readFile(join(result.knowledgeRoot, 'meta/schema.json'), 'utf8')
    const writePolicyJson = await readFile(join(result.knowledgeRoot, 'meta/write-policy.json'), 'utf8')
    const readme = await readFile(join(result.knowledgeRoot, 'README.md'), 'utf8')

    expect(schemaJson).toContain('"status": "implemented"')
    expect(writePolicyJson).toContain('candidateOnlyCollections')
    expect(readme).toContain('global directory')
  })

  it('does not overwrite existing append-only files on repeated bootstrap', async () => {
    const first = await knowledgeContractService.bootstrapWorkspace(workspacePath)
    const observationsPath = join(first.knowledgeRoot, 'observations/observations.jsonl')

    await readFile(observationsPath, 'utf8')
    const before = '{"id":"obs-1"}\n'
    await import('fs/promises').then(({ writeFile }) => writeFile(observationsPath, before, 'utf8'))

    const second = await knowledgeContractService.bootstrapWorkspace(workspacePath)
    const after = await readFile(observationsPath, 'utf8')

    expect(second.createdFiles).toEqual([])
    expect(after).toBe(before)
  })
})
