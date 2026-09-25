import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NOTE_URI_RE, checkLifecycle, parseNote, serializeNote, validateNote, type ParsedNote } from '@janus-agent/harness-core'
import { assertAssetPath, buildNoteIndex, sha256HexBytes, withAssetLock, type NoteIndex } from '@janus-agent/harness-node'
import type { HarnessTaskContractInput, HarnessTaskDraft } from '../../shared/ipc/harness'
import { setSection } from './artifact-producer'
import { harnessNoteService } from './service'

const fail = (code: string, message: string): never => { throw { code, message } }

async function currentTask(root: string, uri: string) {
  const index = await buildNoteIndex(root)
  if (!NOTE_URI_RE.test(uri) || !uri.startsWith(`note://${index.repoId}/`)) fail('UNRESOLVED_REFERENCE', 'Task belongs to another repository')
  const entry = index.byId.get(uri.split('/').pop()!)
  if (!entry?.note || entry.note.meta.kind !== 'task') return fail('NOT_FOUND', 'Task Note not found')
  await assertAssetPath(root, entry.relPath)
  const bytes = await readFile(join(root, entry.relPath))
  return { index, note: parseNote(bytes.toString('utf8')), hash: sha256HexBytes(bytes) }
}

function asDraft(uri: string, repoId: string, note: ParsedNote, hash: string): HarnessTaskDraft {
  return {
    uri, hash, repoId, lifecycle: note.meta.lifecycle, hasExecution: !!note.meta.execution,
    contract: {
      scope: note.sections.find((section) => section.name === 'Scope')?.text.trim() ?? '',
      criteria: note.acs.map(({ id, text }) => ({ id, text })),
      work: note.meta.work ?? { scope: [{ repoId, paths: [] }], acceptanceRefs: [], verification: [] },
    },
  }
}

export async function readTaskDraft(root: string, uri: string): Promise<HarnessTaskDraft> {
  return withAssetLock(root, async () => {
    const current = await currentTask(root, uri)
    return asDraft(uri, current.index.repoId!, current.note, current.hash)
  })
}

// Note: explicit adoption fills the executable contract - see .agents/notes/2026-09-18-task-contract-adoption--6b7c688e.md
export function acceptedTaskMarkdown(note: ParsedNote, uri: string, repoId: string, input: HarnessTaskContractInput, index: NoteIndex): string {
  if (note.meta.execution) fail('BUSY', 'A task with execution cannot be adopted again')
  if (!['draft', 'proposed'].includes(note.meta.lifecycle)) fail('NOT_READY', 'Only draft or proposed tasks can be adopted')
  for (const [from, to] of note.meta.lifecycle === 'draft' ? [['draft', 'proposed'], ['proposed', 'accepted']] as const : [['proposed', 'accepted']] as const) {
    const errors = checkLifecycle(from, to, { kind: 'task', authorized: true })
    if (errors.length) fail(errors[0].code, errors[0].message)
  }
  const placeholder = /^(?:TBD\b|TODO\b|待定|待确认)/i
  if (!input || typeof input.scope !== 'string' || !input.scope.trim() || placeholder.test(input.scope.trim())) fail('NOT_READY', 'Scope must describe the actual work')
  if (!Array.isArray(input.criteria) || input.criteria.some((item) => !item || typeof item.text !== 'string' || !item.text.trim() || placeholder.test(item.text.trim()) || /[\r\n]/.test(item.text))) fail('NOT_READY', 'Acceptance criteria must be concrete single-line statements')
  if (!input.work || !Array.isArray(input.work.scope) || !input.work.scope.length
    || input.work.scope.some((item) => !item || item.repoId !== repoId)) fail('NOT_READY', 'Task scope must belong to the selected primary repository')
  if (!Array.isArray(input.work.verification) || !input.work.verification.length) fail('NOT_READY', 'Verification is required')
  const stepIds = new Set<string>()
  for (const step of input.work.verification) {
    if (!step || typeof step.id !== 'string' || !step.id || stepIds.has(step.id) || step.repoId !== repoId || typeof step.required !== 'boolean'
      || !['command', 'manual'].includes(step.kind) || typeof step.cwd !== 'string') fail('SCHEMA_INVALID', 'Invalid verification step')
    stepIds.add(step.id)
    if (step.kind === 'command' && (typeof step.program !== 'string' || !step.program.trim() || !Array.isArray(step.args) || step.args.some((arg) => typeof arg !== 'string'))) fail('NOT_READY', 'Command needs a program and an argument list')
    if (step.kind === 'manual' && (typeof step.description !== 'string' || !step.description.trim() || placeholder.test(step.description.trim()))) fail('NOT_READY', 'Manual verification needs a concrete procedure')
  }
  if (!input.work.verification.some((step) => step.required)) fail('NOT_READY', 'At least one verification step must be required')
  const work = structuredClone(input.work)
  if (!Array.isArray(work.acceptanceRefs) || work.acceptanceRefs.some((ref) => !ref || typeof ref.uri !== 'string' || typeof ref.criterionId !== 'string')) fail('SCHEMA_INVALID', 'Acceptance references must be a list of Note criteria')
  const refs = new Map(work.acceptanceRefs.map((ref) => [`${ref.uri}#${ref.criterionId}`, ref]))
  for (const criterion of input.criteria) refs.set(`${uri}#${criterion.id}`, { uri, criterionId: criterion.id })
  work.acceptanceRefs = [...refs.values()]
  const implementsByUri = new Map<string, string[]>()
  for (const ref of work.acceptanceRefs) {
    if (ref.uri === uri) {
      if (!input.criteria.some((criterion) => criterion.id === ref.criterionId)) fail('INVALID_RELATION', `Unknown task criterion ${ref.criterionId}`)
      continue
    }
    const target = ref.uri.startsWith(`note://${repoId}/`) ? index.byId.get(ref.uri.split('/').pop()!) : undefined
    if (!target?.note || target.diagnostics.length || !['requirement', 'initiative'].includes(target.note.meta.kind)
      || target.note.meta.lifecycle !== 'accepted' || !target.note.acs.some((criterion) => criterion.id === ref.criterionId)) fail('UNRESOLVED_REFERENCE', `Acceptance target must be an accepted requirement or initiative: ${ref.uri}#${ref.criterionId}`)
    if (target!.note!.meta.kind === 'requirement') implementsByUri.set(ref.uri, [...(implementsByUri.get(ref.uri) ?? []), ref.criterionId])
  }
  let body = setSection(note.body, 'Scope', input.scope.trim())
  body = setSection(body, 'Acceptance criteria', input.criteria.map((item) => `- [ ] ${item.id}: ${item.text.trim()}`).join('\n') || 'See work.acceptanceRefs.')
  body = setSection(body, 'Verification', work.verification.map((step) => `- ${step.id}: ${step.kind === 'command' ? [step.program, ...(step.args ?? [])].join(' ') : step.description}`).join('\n'))
  const markdown = serializeNote({ ...note, body, meta: {
    ...note.meta, lifecycle: 'accepted', repositories: { ...note.meta.repositories, primary: repoId }, work,
    relations: [
      ...(note.meta.relations ?? []).filter((relation) => relation.type !== 'implements'),
      ...[...implementsByUri].map(([target, criteria]) => ({ type: 'implements' as const, target, criteria })),
    ],
  } })
  const errors = validateNote(parseNote(markdown))
  if (errors.length) fail(errors[0].code, errors.map((error) => `${error.path ?? ''}: ${error.message}`).join('\n'))
  return markdown
}

export async function adoptTask(root: string, uri: string, expectedHash: string, contract: HarnessTaskContractInput): Promise<HarnessTaskDraft> {
  const markdown = await withAssetLock(root, async () => {
    const current = await currentTask(root, uri)
    if (current.hash !== expectedHash) fail('CONFLICT', 'Task changed; reload before adoption')
    return acceptedTaskMarkdown(current.note, uri, current.index.repoId!, contract, current.index)
  })
  await harnessNoteService.applyOperations(root, [{ operationId: randomUUID(), type: 'replace', uri, expectedHash, afterMarkdown: markdown }], 'Adopt the reviewed task contract')
  return readTaskDraft(root, uri)
}
