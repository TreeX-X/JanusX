// Note: pure-Note cross-module architecture — see .agents/notes/blueprint/workspaces/architect-workspace-model.md
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createNoteInput, parseNote, serializeNote, type HarnessNoteMeta, type NoteKind } from '@janus-agent/harness-core'
import { applyHarnessInit, previewHarnessInit } from '@janus-agent/harness-node'
import { HarnessNoteService } from '../../src/main/harness/service'

export async function createArchitectWorkspace() {
  const root = await mkdtemp(join(tmpdir(), 'janus-architect-v2-'))
  const plan = await previewHarnessInit(root, 'Architect plan')
  await applyHarnessInit(plan)
  const project = parseNote(await readFile(join(root, '.agents/notes/module.md'), 'utf8'))
  const projectUri = `note://${plan.repoId}/${project.meta.id}`
  const add = async (kind: NoteKind, title: string, path: string, owner: string, extra: Partial<HarnessNoteMeta> = {}, sections?: Record<string, string>) => {
    const note = parseNote(createNoteInput(kind, title, owner, { schema: 'harness-note/2', lifecycle: 'accepted', sections }).markdown)
    Object.assign(note.meta, extra)
    const destination = join(root, '.agents/notes', path)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, serializeNote(note))
    return { id: note.meta.id, uri: `note://${plan.repoId}/${note.meta.id}` }
  }
  const requirement = await add('requirement', 'Shared requirement', 'shared-requirement.md', projectUri, {}, {
    'Expected behavior': 'Reader and Planned module share one contract.', 'Acceptance criteria': '- [ ] AC-1: Reader obeys the shared contract.\n- [ ] AC-2: Planned module preserves the shared contract.',
  })
  const decision = await add('decision', 'Shared decision', 'shared-decision.md', projectUri, {}, {
    Problem: 'Modules need a common format.', Decision: 'Use one shared format.', 'Alternatives considered': 'Separate formats would drift.', Consequences: 'Changes require coordination.',
  })
  const planned = await add('module', 'Planned module', 'planned/module.md', projectUri, {}, {
    Responsibility: `Plan a consumer. [Shared contract](${requirement.uri}).`, Design: 'Implementation is planned; no source code exists yet.',
  })
  const reader = await add('module', 'Reader module', 'reader/module.md', projectUri, { relations: [
    { type: 'governed-by', target: decision.uri }, { type: 'derived-from', target: decision.uri }, { type: 'depends-on', target: planned.uri },
  ] }, { Responsibility: 'Read the agreed format.', Design: 'The shared decision governs this module.' })
  const parser = await add('module', 'Parser submodule', 'reader/parser/module.md', reader.uri, {}, { Responsibility: 'Parse module input.', Design: 'Follow the common requirement.' })
  const reference = await add('note', 'Parser context', 'reader/parser/context.md', parser.uri, {}, { Description: `Read [the common requirement](${requirement.uri}).` })
  const task = await add('task', 'Reader task', 'reader/task.md', reader.uri, { work: {
    scope: [{ repoId: plan.repoId, paths: ['reader/'] }], acceptanceRefs: [{ uri: requirement.uri, criterionId: 'AC-1' }],
    verification: [{ id: 'V-1', kind: 'manual', required: true, repoId: plan.repoId, cwd: '.', description: 'Confirm the shared contract.' }], review: 'independent',
  } })
  const service = new HarnessNoteService()
  const view = await service.projectView(root)
  return { root, repoId: plan.repoId, project: { id: project.meta.id, uri: projectUri }, requirement, decision, reader, planned, parser, reference, task, service, blueprint: view.blueprint }
}
