// Note: wiki proposals use host source receipts — see .agents/notes/2026-09-25-note-wiki-r3--844bc2f1.md
import { useEffect, useRef, useState } from 'react'
import type { CandidateWikiPatch, WikiNoteStatus, WikiPage } from '../../../../shared/knowledge'
import type { NoteWikiDraft, NoteWikiPage } from '../../../../shared/ipc/knowledge'
import styles from './NoteWikiLinks.module.css'

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export function WikiSourceList({ sources, onOpenNote }: { sources: WikiNoteStatus[]; onOpenNote?: (uri: string) => void }) {
  return <ul className={styles.sources}>{sources.map((source, index) => <li key={source.uri || index}>
    <strong>{source.status}</strong> {source.uri && (onOpenNote ? <button type="button" onClick={() => onOpenNote(source.uri)}>{source.uri}</button> : <code>{source.uri}</code>)}
    {source.detail && <span>{source.detail}</span>}
    {source.sourceHash && <small>Recorded: {source.sourceHash}</small>}
    {source.currentHash && <small>Current: {source.currentHash}</small>}
  </li>)}</ul>
}

export function NoteWikiEditor({ rootPath = '', initialUris = [], page, onProposed }: { rootPath?: string; initialUris?: string[]; page?: WikiPage; onProposed?: (candidate: CandidateWikiPatch) => void }) {
  const [root, setRoot] = useState(rootPath)
  const [uris, setUris] = useState(initialUris.join(String.fromCharCode(10)))
  const [slug, setSlug] = useState(page?.slug ?? '')
  const [title, setTitle] = useState(page?.title ?? '')
  const [markdown, setMarkdown] = useState(page?.markdown ?? '')
  const [rationale, setRationale] = useState('')
  const [draft, setDraft] = useState<NoteWikiDraft | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [candidate, setCandidate] = useState<CandidateWikiPatch | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const act = async (work: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await work() } catch (e) { if (mounted.current) setError(errorText(e)) }
    finally { if (mounted.current) setBusy(false) }
  }
  const prepare = () => act(async () => {
    const result = await window.electron.knowledge.prepareNoteWiki({ rootPath: root, uris: uris.split(String.fromCharCode(10)).flatMap(line => line.split(' ')).map(uri => uri.trim()).filter(Boolean), pageSlug: slug, reviewMode: 'full-page', expectedVersion: page?.version ?? 0 })
    if (!mounted.current) return
    setDraft(result); setReviewed(false); setNotice('')
    if (result.page) { setMarkdown(result.page.markdown); setTitle(result.page.title) }
  })
  const propose = () => act(async () => {
    if (!draft || !reviewed) return
    const result = await window.electron.knowledge.proposeNoteWiki({ draftId: draft.draftId, title, markdown, rationale })
    if (!mounted.current) return
    setCandidate(result); setDraft(null); onProposed?.(result)
    setNotice('Proposal saved in the existing wiki review inbox. Approval publishes this exact content.')
  })
  return <section className={styles.editor} aria-label="Note wiki proposal">
    <h4>{page ? 'Review or replace the entire wiki page' : 'Propose a wiki summary from Notes'}</h4>
    <p>{page ? 'Every recorded source is included. Read the current sources and review all page content before proposing replacement.' : 'Select one or more full Note URIs. The host reads the sources before you compose a page.'}</p>
    <label>Checkout path<input value={root} disabled={busy || Boolean(draft) || Boolean(candidate) || Boolean(page?.workspacePath)} onChange={e => setRoot(e.target.value)} /></label>
    <label>Page slug<input value={slug} disabled={busy || Boolean(page) || Boolean(draft) || Boolean(candidate)} onChange={e => setSlug(e.target.value)} /></label>
    <label>Source Note URIs<textarea value={uris} rows={3} disabled={busy || Boolean(draft) || Boolean(candidate)} onChange={e => setUris(e.target.value)} /></label>
    {!draft && !candidate && <button type="button" disabled={busy || !root || !slug || !uris.trim()} onClick={() => void prepare()}>Read sources for review</button>}
    {draft && <>
      <p>Expected page version: {draft.page?.version ?? 0}</p>
      {draft.sources.map(source => <details key={source.uri}><summary>{source.uri}</summary><small>Source hash: {source.sourceHash}</small><pre>{source.raw}</pre></details>)}
      {draft.page && <details><summary>Published full page before replacement</summary><pre>{draft.page.markdown}</pre></details>}
      <label>Title<input value={title} disabled={busy} onChange={e => { setTitle(e.target.value); setReviewed(false) }} /></label>
      <label>Complete page markdown<textarea rows={16} value={markdown} disabled={busy} onChange={e => { setMarkdown(e.target.value); setReviewed(false) }} /></label>
      <label>Review rationale<textarea value={rationale} disabled={busy} onChange={e => setRationale(e.target.value)} /></label>
      <label className={styles.confirm}><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} />I reviewed the entire page against all displayed sources.</label>
      <button type="button" disabled={busy || !reviewed || !markdown.trim() || !title.trim() || !rationale.trim()} onClick={() => void propose()}>Submit for wiki approval</button>
      <button type="button" disabled={busy} onClick={() => { setDraft(null); setReviewed(false) }}>Read sources again</button>
    </>}
    {candidate && <><h4>Proposed full page · {candidate.status}</h4><pre>{candidate.patchMarkdown}</pre><WikiSourceList sources={(candidate.sourceNoteRefs ?? []).map(ref => ({ ...ref, status: 'unknown', detail: 'Sources are checked again at approval' }))} />
      <div className={styles.actions}><button type="button" disabled={busy || candidate.status !== 'proposed'} onClick={() => void act(async () => { const result = await window.electron.knowledge.applyCandidate({ type: 'wiki-patch', id: candidate.id }); if (mounted.current) { setCandidate(result.candidate as CandidateWikiPatch); setNotice('Published through the existing wiki approval and audit path.') } })}>Approve and publish</button>
      <button type="button" disabled={busy || candidate.status !== 'proposed'} onClick={() => void act(async () => { const result = await window.electron.knowledge.rejectCandidate({ type: 'wiki-patch', id: candidate.id }); if (mounted.current) setCandidate(result.candidate as CandidateWikiPatch) })}>Reject proposal</button></div>
    </>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
  </section>
}

export function WikiPageDetail({ page, onOpenNote }: { page: WikiPage; onOpenNote?: (uri: string) => void }) {
  const [sources, setSources] = useState<WikiNoteStatus[]>([])
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let current = true
    setSources([]); setError('')
    window.electron.knowledge.noteWikiStatuses({ workspaceId: page.workspaceId, slug: page.slug }).then(result => { if (current) setSources(result) }, e => { if (current) setError(errorText(e)) })
    return () => { current = false }
  }, [page.workspaceId, page.slug, page.version, refresh])
  return <section className={styles.detail}>
    <p>Workspace: {page.workspaceId} {page.workspacePath} · Page: {page.slug} · Version: {page.version}</p>
    <pre>{page.markdown}</pre><p>Source facts: {page.sourceFactIds.join(', ') || 'None recorded'}</p>
    <button type="button" onClick={() => setRefresh(value => value + 1)}>Refresh source status</button>
    <WikiSourceList sources={sources} onOpenNote={onOpenNote} />{error && <p role="alert">{error}</p>}
    <NoteWikiEditor key={JSON.stringify([page.workspaceId, page.slug, page.version])} rootPath={page.workspacePath} initialUris={page.sourceNoteRefs?.map(ref => ref.uri)} page={page} />
  </section>
}

export function WikiCandidateSources({ candidate }: { candidate: CandidateWikiPatch }) {
  const [sources, setSources] = useState<WikiNoteStatus[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let current = true
    setSources([]); setError('')
    window.electron.knowledge.noteWikiStatuses({ candidateId: candidate.id }).then(result => { if (current) setSources(result) }, e => { if (current) setError(errorText(e)) })
    return () => { current = false }
  }, [candidate.id])
  return <section className={styles.detail}><p>Workspace: {candidate.provenance.workspaceId} · {candidate.provenance.workspacePath}</p><p>Review: {candidate.reviewMode ?? 'incremental'} · Expected page version: {candidate.expectedVersion ?? 'not recorded'}</p><pre>{candidate.patchMarkdown}</pre><p>Rationale: {candidate.rationale}</p><p>Source facts: {candidate.sourceFactIds?.join(', ') || 'None recorded'}</p><WikiSourceList sources={sources} />{error && <p role="alert">{error}</p>}</section>
}

export function NoteWikiLinks(props: { rootPath: string; uri: string; onOpenNote?: (uri: string) => void }) {
  return <NoteWikiLinksContent key={JSON.stringify([props.rootPath, props.uri])} {...props} />
}

function NoteWikiLinksContent({ rootPath, uri, onOpenNote }: { rootPath: string; uri: string; onOpenNote?: (uri: string) => void }) {
  const [pages, setPages] = useState<NoteWikiPage[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let current = true
    setLoading(true); setError('')
    window.electron.knowledge.noteWikiPages({ rootPath, uri }).then(result => { if (current) { setPages(result); setLoading(false) } }, e => { if (current) { setError(errorText(e)); setLoading(false) } })
    return () => { current = false }
  }, [rootPath, uri, refresh])
  const selectedPage = pages.find(({ page }) => JSON.stringify([page.workspaceId, page.slug]) === selected)?.page
  return <section className={styles.detail} aria-label="Knowledge wiki references">
    <h3>Knowledge pages using this Note</h3><button type="button" onClick={() => setRefresh(value => value + 1)}>Refresh knowledge references</button>
    {loading ? <p>Reading knowledge pages…</p> : !pages.length && <p>No published knowledge pages record this Note as a source.</p>}
    {pages.map(({ page, sources }) => <div key={JSON.stringify([page.workspaceId, page.slug])}><button type="button" onClick={() => setSelected(JSON.stringify([page.workspaceId, page.slug]))}>{page.title}</button><p>Workspace: {page.workspaceId} · {page.workspacePath || 'checkout not recorded'} · {page.slug}</p><WikiSourceList sources={sources} onOpenNote={onOpenNote} /></div>)}
    {selectedPage && <WikiPageDetail key={selected} page={selectedPage} onOpenNote={onOpenNote} />}
    <NoteWikiEditor rootPath={rootPath} initialUris={[uri]} />
    {error && <p role="alert">{error}</p>}
  </section>
}
