/**
 * @file Harness IPC Handlers (S4)
 * @description Project-note resolve/graph/apply/bind/share channels over the
 *  single HarnessNoteService. Failures cross IPC as plain HarnessFailure
 *  data; the renderer matches `code`, never Error identity.
 */
import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import type { ParsedNote } from '@janus-agent/harness-core'
import {
  applyNodePatch,
  archiveNoteOp,
  checkWritablePatch,
  createNoteOp,
  nodeTypeToKind,
} from '../harness/artifact-producer'
import { harnessNoteService } from '../harness/service'
import {
  HARNESS_COMMAND_CHANNELS,
  HARNESS_EVENT_CHANNELS,
  type HarnessApplyResult,
  type HarnessBinding,
  type HarnessEditOp,
  type HarnessFailure,
  type HarnessResolveResult,
  type HarnessShareSelection,
} from '../../shared/ipc/harness'

const throwFailure = (code: HarnessFailure['code'], message: string, extra?: Partial<HarnessFailure>): never => {
  throw { code, message, ...extra } satisfies HarnessFailure
}

async function withRoot(cwd: string): Promise<string> {
  const resolved = await harnessNoteService.resolveRoot(cwd)
  if (!resolved.ok || !resolved.root) {
    throwFailure('NOT_FOUND', resolved.diagnostics[0]?.message ?? `no project notes under ${cwd}`)
  }
  return resolved.root as string
}

interface CurrentNote {
  note: ParsedNote
  relPath: string
  sha256: string
}

async function currentNote(root: string, uri: string): Promise<CurrentNote> {
  const id = uri.split('/').pop() ?? uri
  return harnessNoteService.readNote(root, id)
}

export function registerHarnessHandlers(getWindow: () => BrowserWindow | null): void {
  harnessNoteService.onChange((event) => {
    getWindow()?.webContents.send(HARNESS_EVENT_CHANNELS.changed, {
      root: event.root,
      rev: event.rev,
      kinds: [...new Set(event.events.map((e) => e.type))],
    })
  })

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.resolve, async (_e, cwd: string): Promise<HarnessResolveResult> => {
    const resolved = await harnessNoteService.resolveRoot(cwd)
    if (!resolved.ok || !resolved.root) return { ok: false, diagnostics: resolved.diagnostics }
    const view = await harnessNoteService.projectView(resolved.root)
    return {
      ok: true,
      root: resolved.root,
      repoId: view.repoId,
      repoName: view.repoName,
      projectId: view.blueprint.id,
      diagnostics: [],
    }
  })

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.projectGraph, async (_e, cwd: string) => {
    const root = await withRoot(cwd)
    await harnessNoteService.watch(root)
    return harnessNoteService.projectView(root)
  })

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.rescan, async (_e, cwd: string) => {
    const root = await withRoot(cwd)
    return harnessNoteService.rescan(root)
  })

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.apply,
    async (_e, cwd: string, operations: HarnessEditOp[], reason: string): Promise<HarnessApplyResult> => {
      const root = await withRoot(cwd)
      const view = await harnessNoteService.projectView(root)
      if (!view.repoId) throwFailure('NOT_FOUND', 'init .agents/harness.json with a repoId first')
      const repoId = view.repoId as string
      const ops: Array<{
        operationId: string
        type: 'create' | 'replace' | 'delete'
        uri: string
        expectedHash: string | null
        relativePath?: string
        afterMarkdown?: string
      }> = []
      const uris: string[] = []
      for (const op of operations) {
        if (op.kind === 'create') {
          const created = createNoteOp(repoId, nodeTypeToKind(op.nodeType), op.title, op.parentUri ?? null, reason)
          ops.push({ ...created })
          uris.push(created.uri)
        } else if (op.kind === 'update') {
          const current = await currentNote(root, op.uri)
          const managed = checkWritablePatch(op.patch)
          if (managed) throwFailure('HARNESS_MANAGED', managed.message, { path: op.uri })
          const produced = applyNodePatch(current.note, op.patch)
          if ('edit' in produced) {
            const raw = await readFile(join(root, current.relPath), 'utf8')
            const markdown = harnessNoteService.mergeNoteEdit(current.note, raw, produced.edit, reason)
            ops.push({
              operationId: `replace-${current.note.meta.id.slice(0, 8)}-${randomUUID().slice(0, 4)}`,
              type: 'replace',
              uri: op.uri,
              expectedHash: op.expectedHash,
              afterMarkdown: markdown,
            })
            uris.push(op.uri)
          } else {
            throw { code: produced.code ?? 'SCHEMA_INVALID', message: produced.message, path: op.uri } as HarnessFailure
          }
        } else if (op.kind === 'rename') {
          const current = await currentNote(root, op.uri)
          const raw = await readFile(join(root, current.relPath), 'utf8')
          ops.push({
            operationId: `rename-${current.note.meta.id.slice(0, 8)}`,
            type: 'replace',
            uri: op.uri,
            expectedHash: op.expectedHash,
            relativePath: op.relativePath,
            afterMarkdown: raw,
          })
          uris.push(op.uri)
        } else if (op.kind === 'reparent') {
          const current = await currentNote(root, op.uri)
          const raw = await readFile(join(root, current.relPath), 'utf8')
          const markdown = harnessNoteService.mergeNoteEdit(
            current.note,
            raw,
            { sections: {}, frontmatter: { parent: op.parentUri } },
            reason,
          )
          ops.push({
            operationId: `reparent-${current.note.meta.id.slice(0, 8)}`,
            type: 'replace',
            uri: op.uri,
            expectedHash: op.expectedHash,
            afterMarkdown: markdown,
          })
          uris.push(op.uri)
        } else {
          const current = await currentNote(root, op.uri)
          const raw = await readFile(join(root, current.relPath), 'utf8')
          const markdown = harnessNoteService.mergeNoteEdit(
            current.note,
            raw,
            { sections: {}, frontmatter: { lifecycle: 'archived' } },
            op.reason,
          )
          const archived = archiveNoteOp(op.uri, op.expectedHash, markdown, op.reason)
          ops.push({ ...archived })
          uris.push(op.uri)
        }
      }
      try {
        const report = await harnessNoteService.applyOperations(root, ops, reason || 'canvas edit')
        return {
          txId: report.txId,
          applied: report.applied.map((r, i) => ({ ...r, uri: uris[i] ?? '' })),
        }
      } catch (e) {
        const err = e as Partial<HarnessFailure> & { message?: unknown }
        if (err.code === 'HARNESS_CONFLICT' || err.code === 'CONFLICT') {
          throw {
            code: 'HARNESS_CONFLICT',
            message: String(err.message ?? 'conflict'),
            path: err.path,
            expectedHash: err.expectedHash,
            currentHash: err.currentHash,
          } as HarnessFailure
        }
        throw { code: err.code ?? 'SCHEMA_INVALID', message: String(err.message ?? e) } as HarnessFailure
      }
    },
  )

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.bindingsGet, async (_e, cwd: string) => {
    const root = await withRoot(cwd)
    return harnessNoteService.getBindings(root)
  })

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.bindingsSet, async (_e, cwd: string, binding: HarnessBinding) => {
    const root = await withRoot(cwd)
    return harnessNoteService.setBinding(root, binding)
  })

  ipcMain.handle(HARNESS_COMMAND_CHANNELS.sharePreview, async (_e, cwd: string, selection: HarnessShareSelection) => {
    const root = await withRoot(cwd)
    const snapshot = await harnessNoteService.shareSnapshot(root, selection)
    return { notes: snapshot.notes.length, json: JSON.stringify(snapshot, null, 2) }
  })

  ipcMain.handle(
    HARNESS_COMMAND_CHANNELS.shareExport,
    async (_e, cwd: string, selection: HarnessShareSelection, outPath: string) => {
      const root = await withRoot(cwd)
      return harnessNoteService.exportSnapshot(root, selection, outPath)
    },
  )
}
