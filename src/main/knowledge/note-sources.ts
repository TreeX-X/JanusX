// Note: host reads own wiki provenance — see .agents/notes/2026-09-25-note-wiki-r3--844bc2f1.md
import { createHash, randomUUID } from 'crypto'
import { harnessNoteService } from '../harness/service'
import { resolveWorkspaceIdentity, workspacePathKey } from './workspace-identity'
import { knowledgeTruthService } from './truth-service'
import type { CandidateWikiPatch, WikiNoteRef, WikiNoteStatus } from '../../shared/knowledge'
import type { NoteWikiDraft, NoteWikiPage, PrepareNoteWikiInput } from '../../shared/ipc/knowledge'

const URI = new RegExp('^note://[0-9a-f-]{36}/[0-9a-f-]{36}$', 'i')
type SourceRead = WikiNoteStatus & { raw?: string }
let sourceReadQueue: Promise<void> = Promise.resolve()

export function readWikiNote(rootPath: string, uri: string): Promise<SourceRead> {
  // Shared harness scans use an exclusive asset lock; concurrent views queue reads.
  const next = sourceReadQueue.then(() => readWikiNoteUnlocked(rootPath, uri))
  sourceReadQueue = next.then(() => undefined, () => undefined)
  return next
}

async function readWikiNoteUnlocked(rootPath: string, uri: string): Promise<SourceRead> {
  if (!rootPath || !URI.test(uri)) return { uri, status: 'unknown', detail: 'No recorded checkout or valid Note URI' }
  try {
    await harnessNoteService.rescan(rootPath)
    let snapshot = await harnessNoteService.readSnapshot(rootPath)
    const repoId = uri.split('/')[2]
    let checkout = rootPath
    if (snapshot.repoId !== repoId) {
      const bindings = (await harnessNoteService.getBindings(rootPath)).filter(b => b.repoId === repoId)
      const selected = bindings.filter(b => b.selected)
      const candidates = selected.length ? selected : bindings
      if (!candidates.length) return { uri, status: 'unbound', detail: 'Repository has no explicit checkout binding' }
      if (candidates.length !== 1) return { uri, status: 'ambiguous', detail: 'Select one repository checkout' }
      checkout = candidates[0]!.path
      await harnessNoteService.rescan(checkout)
      snapshot = await harnessNoteService.readSnapshot(checkout)
      if (snapshot.repoId !== repoId) return { uri, status: 'unbound', detail: 'Bound checkout identity is unavailable or different' }
    }
    const entries = snapshot.entries.filter(e => e.uri === uri)
    if (entries.length > 1) return { uri, status: 'ambiguous', detail: 'Duplicate Note identity' }
    if (!entries.length) return snapshot.coverage.status === 'complete'
      ? { uri, status: 'missing' }
      : { uri, status: 'unknown', detail: 'Repository scan is incomplete; Note absence is not established' }
    if (!entries[0]!.doc) return { uri, status: 'unknown', detail: 'Note cannot be parsed' }
    const read = await harnessNoteService.readNote(checkout, uri)
    return { uri, status: 'fresh', currentHash: read.sha256, raw: read.raw }
  } catch (error) {
    const code = (error as { code?: string }).code
    return { uri, status: code === 'CONFLICT' ? 'ambiguous' : 'unknown', detail: error instanceof Error ? error.message : String((error as { message?: string }).message ?? error) }
  }
}

export async function wikiSourceStatuses(rootPath: string, refs?: WikiNoteRef[]): Promise<WikiNoteStatus[]> {
  if (!refs?.length) return [{ uri: '', status: 'unknown', detail: 'Note sources not recorded' }]
  const statuses: WikiNoteStatus[] = []
  for (const ref of refs) {
    if (!ref.sourceHash) { statuses.push({ uri: ref.uri, status: 'unknown', detail: 'Source hash not recorded' }); continue }
    const { raw: _raw, ...read } = await readWikiNote(rootPath, ref.uri)
    statuses.push({ ...read, sourceHash: ref.sourceHash, status: read.status === 'fresh' && read.currentHash !== ref.sourceHash ? 'changed' : read.status })
  }
  return statuses
}

export async function assertWikiSources(rootPath: string, refs: WikiNoteRef[]): Promise<void> {
  const statuses = await wikiSourceStatuses(rootPath, refs)
  const failed = statuses.find(s => s.status !== 'fresh')
  if (failed) throw new Error(`Note source ${failed.uri}: ${failed.status}; read sources and create a new proposal`)
}

export async function wikiWorkspace(rootPath: string) {
  const identity = await resolveWorkspaceIdentity(rootPath)
  return { ...identity, workspaceId: identity.fallback ? `checkout-${createHash('sha256').update(workspacePathKey(rootPath)).digest('hex')}` : identity.workspaceId }
}

export async function noteWikiPages(rootPath: string, uri: string): Promise<NoteWikiPage[]> {
  if (!URI.test(uri)) throw new Error('A full Note URI is required')
  const { wikiPages } = await knowledgeTruthService.list()
  return Promise.all(wikiPages.filter(p => p.sourceNoteRefs?.some(ref => ref.uri === uri)).map(async page => ({
    page, sources: await wikiSourceStatuses(page.workspacePath ?? '', page.sourceNoteRefs),
  })))
}

// Short-lived preparation receipts bind the editor's source view to the proposal.
// They are never a source registry and are discarded on host restart.
const drafts = new Map<string, { input: PrepareNoteWikiInput; draft: NoteWikiDraft; workspace: Awaited<ReturnType<typeof wikiWorkspace>>; expires: number }>()

export async function prepareNoteWiki(input: PrepareNoteWikiInput): Promise<NoteWikiDraft> {
  if (!input.rootPath?.trim() || !input.pageSlug?.trim() || !Array.isArray(input.uris) || !input.uris.length || input.uris.length > 50
    || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || !['incremental', 'full-page'].includes(input.reviewMode)) throw new Error('Invalid Note wiki proposal input')
  const workspace = await wikiWorkspace(input.rootPath)
  const page = (await knowledgeTruthService.list()).wikiPages.find(p => p.workspaceId === workspace.workspaceId && p.slug === input.pageSlug)
  if ((page?.version ?? 0) !== input.expectedVersion) throw new Error('Page version changed; open the current full page')
  const uris = [...new Set([...input.uris, ...(input.reviewMode === 'full-page' ? page?.sourceNoteRefs?.map(r => r.uri) ?? [] : [])])]
  if (uris.length > 50) throw new Error('A page review supports at most 50 Note sources')
  const sources: NoteWikiDraft['sources'] = []
  for (const uri of uris) {
    const source = await readWikiNote(input.rootPath, uri)
    if (source.status !== 'fresh' || source.raw === undefined || !source.currentHash) throw new Error(`Note source ${uri}: ${source.status}`)
    sources.push({ uri, sourceHash: source.currentHash, raw: source.raw })
  }
  for (const [key, value] of drafts) if (value.expires < Date.now()) drafts.delete(key)
  if (drafts.size >= 100) throw new Error('Too many open proposals; finish a review or retry later')
  const draft = { draftId: randomUUID(), page, sources }
  drafts.set(draft.draftId, { input: { ...input, uris }, draft, workspace, expires: Date.now() + 30 * 60_000 })
  return structuredClone(draft)
}

export async function buildNoteWikiCandidate(input: { draftId: string; title: string; markdown: string; rationale: string }): Promise<CandidateWikiPatch> {
  const prepared = drafts.get(input.draftId)
  if (!prepared || prepared.expires < Date.now()) throw new Error('Source review expired; read sources again')
  if (!input.title?.trim() || !input.markdown?.trim() || !input.rationale?.trim()) throw new Error('Title, full content and review rationale are required')
  const refs = prepared.draft.sources.map(({ uri, sourceHash }) => ({ uri, sourceHash }))
  await assertWikiSources(prepared.input.rootPath, refs)
  const { workspaceId, workspaceName, workspacePath } = prepared.workspace
  const candidate: CandidateWikiPatch = {
    id: randomUUID(), type: 'wiki-patch', status: 'proposed', pageSlug: prepared.input.pageSlug,
    title: input.title.trim(), patchMarkdown: input.markdown, rationale: input.rationale, confidence: 1,
    sourceNoteRefs: refs, reviewMode: prepared.input.reviewMode, expectedVersion: prepared.input.expectedVersion,
    sourceFactIds: prepared.draft.page?.sourceFactIds ?? [], derivation: 'deterministic', evidence: { observationIds: [] },
    provenance: { workspaceId, workspaceName, workspacePath, source: 'manual', sourceObservationIds: [], fileRefs: [], actor: 'note-wiki-review', createdAt: new Date().toISOString() },
  }
  drafts.delete(input.draftId)
  return candidate
}
