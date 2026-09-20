import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HarnessNoteService } from '../../src/main/harness/service'
import { applyUndo, latestCommittedTx, previewUndo } from '../../src/main/harness/undo'

const REPO = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'
const TASK_ID = '66666666-6666-4333-8333-666666666666'
const TASK_URI = `note://${REPO}/${TASK_ID}`
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

function taskNote(id: string, scope: string): string {
  return [
    '---', 'schema: harness-note/1', `id: ${id}`, 'kind: task', 'lifecycle: accepted', 'created: 2026-09-18',
    'work:', '  scope:', `    - repoId: ${REPO}`, "      paths: ['./']", '  acceptanceRefs:', `    - uri: note://${REPO}/${id}`, '      criterionId: AC-1',
    '  verification:', '    - id: V-1', '      kind: manual', '      required: true', `      repoId: ${REPO}`, '      cwd: .', '      description: Eyeball it.',
    '---', '', '# Undo probe task', '', '## Scope', '', scope, '', '## Acceptance criteria', '', '- [ ] AC-1: Undo restores scope.', '',
    '## Verification', '', 'Eyeball it.', '',
  ].join('\n')
}

async function makeRoot(): Promise<{ root: string; rel: string }> {
  const root = await mkdtemp(join(tmpdir(), 'harness-undo-'))
  roots.push(root)
  await mkdir(join(root, '.agents', 'notes'), { recursive: true })
  await writeFile(join(root, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId: REPO, name: 'Undo', profile: SUPPORTED_HARNESS_PROFILE }))
  const rel = `.agents/notes/2026-09-18-probe--${TASK_ID.slice(0, 8)}.md`
  await writeFile(join(root, rel), taskNote(TASK_ID, 'First scope.'))
  return { root, rel }
}

async function replaceScope(root: string, rel: string, scope: string, hash: string): Promise<string> {
  const service = new HarnessNoteService()
  const report = await service.applyOperations(root, [{
    operationId: `op-${scope.length}`, type: 'replace', uri: TASK_URI, expectedHash: hash, afterMarkdown: taskNote(TASK_ID, scope),
  }], 'Probe edit')
  return report.txId
}

describe('harness undo', () => {
  it('previews and reverses a replace as a new undoable write', async () => {
    const { root, rel } = await makeRoot()
    const service = new HarnessNoteService()
    const before = await service.readNote(root, TASK_ID)
    const txId = await replaceScope(root, rel, 'Second scope.', before.sha256)
    expect(await latestCommittedTx(root)).toBe(txId)

    const previewed = await previewUndo(root)
    expect(previewed.errors).toEqual([])
    expect(previewed.preview).toMatchObject({ txId, reversible: true })
    expect(previewed.preview?.files).toMatchObject([{ relPath: rel, status: 'reversible' }])

    const applied = await applyUndo(root)
    expect(applied.errors).toEqual([])
    expect(applied.reverted).toEqual([rel])
    expect(await readFile(join(root, rel), 'utf8')).toContain('First scope.')

    const again = await previewUndo(root, applied.txId)
    expect(again.preview?.files.every((file) => file.status !== 'conflict')).toBe(true)
    const redo = await previewUndo(root)
    expect(redo.preview?.txId).toBe(applied.txId)
  })

  it('refuses the whole package on conflict and writes nothing', async () => {
    const { root, rel } = await makeRoot()
    const service = new HarnessNoteService()
    const before = await service.readNote(root, TASK_ID)
    const txId = await replaceScope(root, rel, 'Second scope.', before.sha256)
    await writeFile(join(root, rel), taskNote(TASK_ID, 'Foreign scope.'))
    const previewed = await previewUndo(root, txId)
    expect(previewed.preview).toMatchObject({ reversible: false })
    expect(previewed.preview?.files).toMatchObject([{ status: 'conflict' }])
    const applied = await applyUndo(root, txId)
    expect(applied.errors.some((error) => error.code === 'CONFLICT')).toBe(true)
    expect(applied.reverted).toEqual([])
    expect(await readFile(join(root, rel), 'utf8')).toContain('Foreign scope.')
  })

  it('reverses creates by deleting and deletes by recreating', async () => {
    const { root } = await makeRoot()
    const service = new HarnessNoteService()
    const otherId = '77777777-7777-4777-8777-777777777777'
    const otherRel = `.agents/notes/2026-09-18-temp--${otherId.slice(0, 8)}.md`
    const created = await service.applyOperations(root, [{
      operationId: 'op-create', type: 'create', uri: `note://${REPO}/${otherId}`, expectedHash: null, relativePath: `2026-09-18-temp--${otherId.slice(0, 8)}.md`, afterMarkdown: taskNote(otherId, 'Temp scope.'),
    }], 'Probe create')
    const undoneCreate = await applyUndo(root, created.txId)
    expect(undoneCreate.errors).toEqual([])
    await expect(readFile(join(root, otherRel), 'utf8')).rejects.toThrow()

    const rel = `.agents/notes/2026-09-18-probe--${TASK_ID.slice(0, 8)}.md`
    const current = await service.readNote(root, TASK_ID)
    await service.applyOperations(root, [{ operationId: 'op-delete', type: 'delete', uri: TASK_URI, expectedHash: current.sha256 }], 'Probe delete', { allowDelete: true })
    const undoneDelete = await applyUndo(root)
    expect(undoneDelete.errors).toEqual([])
    expect(await readFile(join(root, rel), 'utf8')).toContain('First scope.')
  })

  it('reports no managed writes on fresh checkouts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'harness-undo-empty-'))
    roots.push(root)
    expect(await latestCommittedTx(root)).toBeNull()
    const previewed = await previewUndo(root)
    expect(previewed.preview).toBeNull()
    expect(previewed.errors.some((error) => error.code === 'NOT_FOUND')).toBe(true)
  })
})
