// Note: Janus extends the shared agentX runtime — see .agents/notes/2026-10-04-agentx-harness-inheritance--bd7fd0c6.md
export { createNoteInput, createNoteOp, setSection, mergeNoteEdit, archiveNoteOp, type ProducedOp, type NoteEdit, type NoteKind } from '@janus-agent/harness-core'
export { applyNodePatch, checkWritablePatch, mapStatusToLifecycle, nodeTypeToKind, type NodeFieldPatch } from '../notes/note-to-blueprint'
