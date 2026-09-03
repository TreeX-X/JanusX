import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

import {
  captureForCwd,
  configureKnowledgeWorkspacesDir,
  knowledgeCaptureFailureCount,
  logKnowledgeCaptureFailure,
  resolveWorkspaceIdentity,
  workspacePathKey,
  workspaceProvenanceFor,
} from '../../../src/main/knowledge/workspace-identity'
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { knowledgeDiagnosticsService } from '../../../src/main/knowledge/diagnostics-service'

describe('workspace identity (Phase 0)', () => {
  let root: string
  let workspacesDir: string
  let projectDir: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-ws-identity-'))
    workspacesDir = join(root, 'workspaces')
    projectDir = join(root, 'My Project')
    await mkdir(workspacesDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(
      join(workspacesDir, 'ws-real-id.json'),
      JSON.stringify({ id: 'ws-real-id', name: 'Real Name', path: projectDir }),
    )
    await writeFile(join(workspacesDir, 'broken.json'), '{not json')
    configureKnowledgeWorkspacesDir(workspacesDir)
    process.env.JANUSX_KNOWLEDGE_ROOT = join(root, 'knowledge')
  })

  afterEach(async () => {
    configureKnowledgeWorkspacesDir(null)
    if (previousKnowledgeRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    await rm(root, { recursive: true, force: true })
  })

  it('resolves the registered record id when the cwd matches a workspace path', async () => {
    const identity = await resolveWorkspaceIdentity(projectDir)
    expect(identity).toEqual({
      workspaceId: 'ws-real-id',
      workspaceName: 'Real Name',
      workspacePath: projectDir,
      fallback: false,
    })
  })

  it('normalizes separators, trailing slashes and casing before matching', async () => {
    const variant = `${projectDir.replace(/\\/g, '/')}/`
    const identity = await resolveWorkspaceIdentity(variant)
    expect(identity.workspaceId).toBe('ws-real-id')
    expect(identity.fallback).toBe(false)
    expect(workspacePathKey(variant)).toBe(workspacePathKey(projectDir))
    if (process.platform === 'win32') {
      expect((await resolveWorkspaceIdentity(projectDir.toUpperCase())).workspaceId).toBe('ws-real-id')
    }
  })

  it('falls back to the directory basename and flags it when no record matches', async () => {
    const unknown = join(root, 'unregistered-dir')
    const identity = await resolveWorkspaceIdentity(unknown)
    expect(identity).toEqual({
      workspaceId: 'unregistered-dir',
      workspaceName: 'unregistered-dir',
      workspacePath: unknown,
      fallback: true,
    })

    const provenance = await workspaceProvenanceFor(unknown, { keep: 'me' })
    expect(provenance.metadata).toEqual({ keep: 'me', workspaceIdFallback: true })

    const matched = await workspaceProvenanceFor(projectDir, { keep: 'me' })
    expect(matched.metadata).toEqual({ keep: 'me' })
  })

  it('captures from a cwd with the registered id and reports it in diagnostics', async () => {
    const good = await captureForCwd(projectDir, {
      source: 'tool',
      type: 'git-event',
      content: 'git commit: phase 0',
      tags: ['git-commit'],
      actor: 'user',
    })
    expect(good.workspaceId).toBe('ws-real-id')
    expect(good.workspaceName).toBe('Real Name')
    expect(good.metadata?.workspaceIdFallback).toBeUndefined()

    const unknown = join(root, 'stray')
    await mkdir(unknown, { recursive: true })
    const guessed = await captureForCwd(unknown, {
      source: 'checkpoint',
      type: 'checkpoint-event',
      content: 'checkpoint created for stray directory',
      actor: 'system',
    })
    expect(guessed.workspaceId).toBe('stray')
    expect(guessed.metadata?.workspaceIdFallback).toBe(true)

    const listed = await knowledgeObservationService.list({ scope: 'workspace', workspaceId: 'ws-real-id' })
    expect(listed.map((o) => o.id)).toEqual([good.id])

    const diagnostics = await knowledgeDiagnosticsService.snapshot({ recentLimit: 10 })
    expect(diagnostics.recentObservations.map((o) => o.id).sort()).toEqual([good.id, guessed.id].sort())
    const byId = Object.fromEntries(
      diagnostics.workspaces.map((w) => [w.workspaceId, [w.observations, w.fallbackWorkspaceIds]]),
    )
    expect(byId).toEqual({ stray: [1, 1], 'ws-real-id': [1, 0] })
    expect(diagnostics.candidates).toEqual({ facts: 0, wikiPatches: 0, graphEdges: 0 })
    expect(diagnostics.truth).toEqual({ facts: 0, wikiPages: 0, graphEdges: 0 })

    const scoped = await knowledgeDiagnosticsService.snapshot({ workspaceId: 'ws-real-id' })
    expect(scoped.workspaces).toHaveLength(1)
    expect(scoped.workspaces[0].unprocessedEstimate).toBe(scoped.workspaces[0].evidence)
  })

  it('counts and logs capture failures instead of swallowing them', () => {
    const before = knowledgeCaptureFailureCount()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logKnowledgeCaptureFailure(new Error('disk full'))
    logKnowledgeCaptureFailure('plain string')
    expect(knowledgeCaptureFailureCount()).toBe(before + 2)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[0][0]).toContain('disk full')
    spy.mockRestore()
  })
})
