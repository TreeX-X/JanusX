// Note: Janus extends the shared agentX runtime — see .agents/notes/2026-10-04-agentx-harness-inheritance--bd7fd0c6.md
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Diagnostic } from '@janus-agent/harness-core'
import { NoteService, indexEntries, toSlimSnapshot } from '@janus-agent/harness-node'
import { projectGraph, projectGraphId } from '../notes/note-to-blueprint'
import { composeBlueprint, type BlueprintCheckoutInput } from '../blueprint/blueprint-composition'
import { ADAPTER_VERSION } from '../notes/note-types'
import type { Blueprint } from '../../shared/janus/types'
export { assertNoLocalLeak, claimsHarnessSchema, stripRemoteCreds, type ResolveResult, type ShareSelection, type ShareSnapshot, type BindingRecord, type ChangeListener } from '@janus-agent/harness-node'

export interface ProjectView {
  blueprint: Blueprint
  rev: number
  repoId: string | null
  repoName: string
  invalid: Array<{ relPath: string; diagnostics: Diagnostic[] }>
  adapterVersion: string
}

export class HarnessNoteService extends NoteService {
  private compositionHashes = new Map<string, Record<string, string>>()
  async projectView(root: string): Promise<ProjectView> {
    // Note: explicit checkout projections compose outside the source adapter — see .agents/notes/2026-09-25-blueprint-r4--9b7b1e15.md
    const view = await this.singleProjectView(root)
    const bindings = await this.getBindings(root)
    // Bound checkouts project independently: run them concurrently and keep
    // binding order for a stable composition. Each checkout rides its own
    // cached index, so this is projection-only work, never extra scans.
    const foreign = bindings.filter((binding) => resolve(binding.path).toLowerCase() !== resolve(root).toLowerCase())
    const checkouts = await Promise.all(foreign.map(async (binding): Promise<BlueprintCheckoutInput> => {
      const key = root + '\0' + binding.repoId + '\0' + binding.checkoutId
      try {
        const resolved = await this.resolveRoot(binding.path)
        if (!resolved.ok || !resolved.root) throw new Error('Checkout has no .agents directory')
        const projection = await this.singleProjectView(resolved.root)
        if (projection.repoId !== binding.repoId) throw new Error('Checkout repository identity does not match its binding')
        let dirty: boolean | undefined
        try {
          const result = await promisify(execFile)('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: resolved.root, timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024 })
          dirty = result.stdout.trim().length > 0
        } catch { /* A registered Note workspace may have no Git repository. */ }
        const row: BlueprintCheckoutInput = { ...binding, path: resolved.root, name: projection.repoName, blueprint: projection.blueprint, snapshot: projection.blueprint.noteSnapshot, revision: projection.rev, expectedSourceHashes: this.compositionHashes.get(key), dirty }
        this.compositionHashes.set(key, Object.fromEntries(Object.values(projection.blueprint.nodes).filter((node) => node.sourceUri && node.sourceHash).map((node) => [node.sourceUri!, node.sourceHash!])))
        return row
      } catch (error) {
        return { ...binding, bound: false, diagnostic: error instanceof Error ? error.message : String(error) }
      }
    }))
    return { ...view, blueprint: composeBlueprint({ skeleton: view.blueprint, checkouts }) }
  }

  private async singleProjectView(root: string): Promise<ProjectView> {
    const started = Date.now()
    // Note: reads refresh through the hash-only probe; unchanged bytes ride
    // the cached index allocation-only, changed files patch incrementally.
    // Only the watcher path and explicit rescan skip the probe.
    const { index } = await this.refreshIndex(root)
    const afterCache = Date.now()
    const { entries, invalid } = indexEntries(index)
    const rev = this.acceptIndex(root, index)
    const repoName = await this.repoName(root)
    const ui = await this.loadUiState(root)
    const blueprint = projectGraph(
      {
        repoId: index.repoId,
        repoName,
        entries: entries.map((e) => ({ doc: e.doc, relPath: e.relPath, sha256: e.sha256 })),
        revision: rev,
        snapshot: toSlimSnapshot(index),
      },
      root,
    )
    // Transport slimming: cards and composition overlays read metadata only;
    // bodies/sections travel on demand via readNote, never on every load.
    for (const node of Object.values(blueprint.nodes)) {
      if (node.note && (node.note.body || (node.note.sections?.length ?? 0) > 0)) {
        node.note = { ...node.note, body: undefined, sections: [] }
      }
    }
    const afterProject = Date.now()
    blueprint.canvasLayout = ui.canvasLayout
    blueprint.collapsedNodeIds = ui.collapsedNodeIds
    // Invalid notes stay out of the graph but travel on the projection for
    // the invalid-lane UI; the canvas must never throw on them.
    blueprint.invalidNotes = invalid.map((item) => ({
      relPath: item.relPath,
      classification: item.classification,
      diagnostics: item.diagnostics.map((d) => ({ code: d.code, message: d.message })),
    }))
    // Note: coverage comes from portable receipts - see .agents/notes/2026-09-18-harness-portable-results--11d8826d.md
    if (index.repoId) {
      const overlay = await this.coverageOverlay(root, rev, entries, index.repoId)
      for (const node of Object.values(blueprint.nodes)) {
        const state = overlay.get(node.id)
        if (!state) continue
        if (state.taskDone) { node.status = 'done'; node.progress = 100 }
        if (state.requirement) {
          for (const feature of node.features) {
            const covered = !state.requirement.uncovered.includes(feature.id)
            feature.progress = covered ? 100 : 0
            feature.status = covered ? 'done' : 'planned'
          }
          node.progress = state.acCount ? Math.round(100 * (state.acCount - state.requirement.uncovered.length) / state.acCount) : 0
          if (state.requirement.covered) node.status = 'done'
        }
      }
    }
    console.debug(`[blueprint-r7] projectView rev=${rev} cache=${afterCache - started}ms project=${afterProject - afterCache}ms overlay=${Date.now() - afterProject}ms total=${Date.now() - started}ms root=${root}`)
    return { blueprint, rev, repoId: index.repoId, repoName, invalid, adapterVersion: ADAPTER_VERSION }
  }

  projectIdForRoot(root: string, repoId: string | null): string {
    return projectGraphId(repoId, root)
  }

  /** Canvas-only overlay state. Local, never shared, best effort. */
  async loadUiState(root: string): Promise<{ canvasLayout: Record<string, { x: number; y: number }>; collapsedNodeIds: string[] | null }> {
    try {
      const raw = await readFile(join(root, '.agents', '.local', 'ui', 'project.json'), 'utf8')
      const data = JSON.parse(raw) as { canvasLayout?: unknown; collapsedNodeIds?: unknown }
      return {
        canvasLayout: (data.canvasLayout ?? {}) as Record<string, { x: number; y: number }>,
        collapsedNodeIds: Array.isArray(data.collapsedNodeIds) ? (data.collapsedNodeIds as string[]) : null,
      }
    } catch {
      return { canvasLayout: {}, collapsedNodeIds: null }
    }
  }

  async saveUiState(
    root: string,
    patch: { canvasLayout?: Record<string, { x: number; y: number }>; collapsedNodeIds?: string[] | null },
  ): Promise<void> {
    const current = await this.loadUiState(root)
    const next = {
      canvasLayout: patch.canvasLayout ?? current.canvasLayout,
      collapsedNodeIds: patch.collapsedNodeIds !== undefined ? patch.collapsedNodeIds : current.collapsedNodeIds,
    }
    const file = join(root, '.agents', '.local', 'ui', 'project.json')
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(next, null, 2), 'utf8')
  }

}
export const harnessNoteService = new HarnessNoteService()
