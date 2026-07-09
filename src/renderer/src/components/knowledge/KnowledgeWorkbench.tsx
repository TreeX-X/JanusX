import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  loadKnowledgeWorkbenchSnapshot,
  searchKnowledge,
  type KnowledgeWorkbenchSnapshot,
} from '@/services/knowledge'
import type {
  AuditEvent,
  CandidateFact,
  CandidateGraphEdge,
  CandidateWikiPatch,
  KnowledgeSearchHit,
  Observation,
} from '../../../../shared/knowledge'
import styles from './KnowledgeWorkbench.module.css'

type KnowledgeTab = 'inbox' | 'wiki' | 'graph' | 'search' | 'audit'
type SelectedKind = 'fact' | 'wiki' | 'graph' | 'observation' | 'audit'

interface KnowledgeWorkbenchProps {
  isOpen: boolean
  onClose: () => void
}

interface SelectedRecord {
  kind: SelectedKind
  id: string
  title: string
  body: string
  confidence?: number
  tags: string[]
  sourceIds: string[]
  fileRefs: string[]
  actor?: string
  createdAt?: string
}

const TAB_LABELS: Record<KnowledgeTab, string> = {
  inbox: 'Inbox',
  wiki: 'Wiki',
  graph: 'Graph',
  search: 'Search Lab',
  audit: 'Audit',
}

export function KnowledgeWorkbench({ isOpen, onClose }: KnowledgeWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>('inbox')
  const [snapshot, setSnapshot] = useState<KnowledgeWorkbenchSnapshot | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [query, setQuery] = useState('')
  const [backendSearchRecords, setBackendSearchRecords] = useState<SelectedRecord[]>([])
  const [searchModeLabel, setSearchModeLabel] = useState('Local preview')
  const [selectedId, setSelectedId] = useState<string>('')
  const [error, setError] = useState('')

  const refresh = async () => {
    setStatus('loading')
    setError('')
    try {
      const next = await loadKnowledgeWorkbenchSnapshot()
      setSnapshot(next)
      setSelectedId((current) => current || next.factCandidates[0]?.id || next.wikiPatches[0]?.id || '')
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Knowledge workbench load failed')
      setStatus('error')
    }
  }

  useEffect(() => {
    if (!isOpen) return
    void refresh()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const selected = useMemo(() => {
    if (!snapshot) return null
    return findSelectedRecord(snapshot, selectedId)
  }, [snapshot, selectedId])

  const searchResults = useMemo(() => {
    if (!snapshot) return []
    return buildSearchRecords(snapshot).filter((record) => {
      const needle = query.trim().toLowerCase()
      if (!needle) return true
      return `${record.title} ${record.body} ${record.tags.join(' ')} ${record.fileRefs.join(' ')}`
        .toLowerCase()
        .includes(needle)
    })
  }, [query, snapshot])

  useEffect(() => {
    if (!isOpen || activeTab !== 'search') return
    const trimmed = query.trim()
    if (!trimmed) {
      setBackendSearchRecords([])
      setSearchModeLabel('Local preview')
      return
    }

    let cancelled = false
    setSearchModeLabel('BM25 loading')
    searchKnowledge({ query: trimmed, limit: 12 })
      .then((result) => {
        if (cancelled) return
        setBackendSearchRecords(result.hits.map(recordFromSearchHit))
        setSearchModeLabel(`BM25 · ${result.indexStats.documentCount} docs`)
      })
      .catch(() => {
        if (cancelled) return
        setBackendSearchRecords([])
        setSearchModeLabel('BM25 unavailable')
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, isOpen, query])

  if (!isOpen) return null

  return createPortal(
    <div className={styles.backdrop}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.mark} />
            <div>
              <div className={styles.windowLabel}>Auxiliary Window</div>
              <div className={styles.title}>Knowledge Engine</div>
              <div className={styles.subtitle}>
                Candidate review · provenance · retrieval console
              </div>
            </div>
            {snapshot?.usingDemoData && <span className={styles.badge}>DEMO DATA</span>}
          </div>

          <nav className={styles.tabs}>
            {(Object.keys(TAB_LABELS) as KnowledgeTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`${styles.tabButton} ${activeTab === tab ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </nav>

          <div className={styles.headerActions}>
            <input
              className={styles.searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter knowledge..."
            />
            <button type="button" className={styles.iconButton} onClick={() => void refresh()} title="Refresh">
              R
            </button>
            <button type="button" className={styles.closeButton} onClick={onClose} title="Close" aria-label="Close Knowledge Engine">
              <span aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className={styles.grid}>
          <aside className={styles.leftPane}>
            <div className={styles.paneTitle}>Review Queue</div>
            <RecordList snapshot={snapshot} selectedId={selectedId} onSelect={setSelectedId} />
          </aside>

          <section className={styles.stage}>
            {status === 'loading' && <StateBlock title="Loading knowledge records" />}
            {status === 'error' && <StateBlock title="Workbench unavailable" detail={error} />}
            {status !== 'loading' && status !== 'error' && snapshot && (
              <>
                {activeTab === 'inbox' && (
                  <InboxView snapshot={snapshot} selectedId={selectedId} onSelect={setSelectedId} />
                )}
                {activeTab === 'wiki' && (
                  <WikiView patches={snapshot.wikiPatches} selectedId={selectedId} onSelect={setSelectedId} />
                )}
                {activeTab === 'graph' && (
                  <GraphView snapshot={snapshot} selectedId={selectedId} onSelect={setSelectedId} />
                )}
                {activeTab === 'search' && (
                  <SearchLabView
                    query={query}
                    onQueryChange={setQuery}
                    records={query.trim() ? backendSearchRecords : searchResults}
                    modeLabel={searchModeLabel}
                    onSelect={setSelectedId}
                  />
                )}
                {activeTab === 'audit' && <AuditView events={snapshot.auditEvents} onSelect={setSelectedId} />}
              </>
            )}
          </section>

          <aside className={styles.rightPane}>
            <Inspector record={selected} snapshot={snapshot} />
          </aside>
        </main>
      </section>
    </div>,
    document.body,
  )
}

function RecordList({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: KnowledgeWorkbenchSnapshot | null
  selectedId: string
  onSelect: (id: string) => void
}) {
  if (!snapshot) return <StateBlock title="No snapshot" compact />

  const records = [
    ...snapshot.factCandidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.fact.content,
      meta: `Fact · ${formatConfidence(candidate.fact.confidence)}`,
    })),
    ...snapshot.wikiPatches.map((patch) => ({
      id: patch.id,
      title: patch.title,
      meta: `Wiki patch · ${formatConfidence(patch.confidence)}`,
    })),
    ...snapshot.observations.slice(0, 8).map((observation) => ({
      id: observation.id,
      title: observation.summary || observation.content,
      meta: `${observation.source} · ${observation.retentionClass ?? 'evidence'}`,
    })),
  ]

  if (records.length === 0) return <StateBlock title="Queue empty" compact />

  return (
    <div className={styles.recordList}>
      {records.map((record) => (
        <button
          key={record.id}
          type="button"
          className={`${styles.recordButton} ${selectedId === record.id ? styles.recordActive : ''}`}
          onClick={() => onSelect(record.id)}
        >
          <span className={styles.recordTitle}>{record.title}</span>
          <span className={styles.recordMeta}>{record.meta}</span>
        </button>
      ))}
    </div>
  )
}

function InboxView({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: KnowledgeWorkbenchSnapshot
  selectedId: string
  onSelect: (id: string) => void
}) {
  const candidates = [...snapshot.factCandidates, ...snapshot.wikiPatches, ...snapshot.graphCandidates]

  if (candidates.length === 0) {
    return <StateBlock title="No proposed candidates" detail="Run extraction after a task to populate the review queue." />
  }

  return (
    <div className={styles.viewStack}>
      <div className={styles.metricsRow}>
        <Metric label="Facts" value={snapshot.factCandidates.length} />
        <Metric label="Wiki Patches" value={snapshot.wikiPatches.length} />
        <Metric label="Graph Edges" value={snapshot.graphCandidates.length} />
        <Metric label="Evidence" value={snapshot.retentionStats?.evidence ?? snapshot.observations.length} />
      </div>
      <div className={styles.cardGrid}>
        {snapshot.factCandidates.map((candidate) => (
          <FactCandidateCard
            key={candidate.id}
            candidate={candidate}
            active={selectedId === candidate.id}
            onSelect={onSelect}
          />
        ))}
        {snapshot.wikiPatches.map((patch) => (
          <WikiPatchCard key={patch.id} patch={patch} active={selectedId === patch.id} onSelect={onSelect} />
        ))}
        {snapshot.graphCandidates.map((edge) => (
          <GraphCandidateCard key={edge.id} edge={edge} active={selectedId === edge.id} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

function FactCandidateCard({
  candidate,
  active,
  onSelect,
}: {
  candidate: CandidateFact
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      className={`${styles.reviewCard} ${active ? styles.reviewCardActive : ''}`}
      onClick={() => onSelect(candidate.id)}
    >
      <div className={styles.cardTopline}>
        <span>FACT</span>
        <span>{formatConfidence(candidate.fact.confidence)}</span>
      </div>
      <strong>{candidate.fact.content}</strong>
      <TagRow tags={candidate.fact.tags} />
      <div className={styles.cardFoot}>{candidate.fact.provenance.sourceObservationIds.length} source refs</div>
    </button>
  )
}

function WikiPatchCard({
  patch,
  active,
  onSelect,
}: {
  patch: CandidateWikiPatch
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      className={`${styles.reviewCard} ${active ? styles.reviewCardActive : ''}`}
      onClick={() => onSelect(patch.id)}
    >
      <div className={styles.cardTopline}>
        <span>WIKI PATCH</span>
        <span>{formatConfidence(patch.confidence)}</span>
      </div>
      <strong>{patch.title}</strong>
      <p>{patch.rationale}</p>
      <div className={styles.cardFoot}>{patch.pageSlug}</div>
    </button>
  )
}

function GraphCandidateCard({
  edge,
  active,
  onSelect,
}: {
  edge: CandidateGraphEdge
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      className={`${styles.reviewCard} ${active ? styles.reviewCardActive : ''}`}
      onClick={() => onSelect(edge.id)}
    >
      <div className={styles.cardTopline}>
        <span>GRAPH EDGE</span>
        <span>{formatConfidence(edge.edge.confidence)}</span>
      </div>
      <strong>
        {edge.edge.from} → {edge.edge.to}
      </strong>
      <p>{edge.edge.type}</p>
      <div className={styles.cardFoot}>{edge.edge.sourceFactIds.length} fact refs</div>
    </button>
  )
}

function WikiView({
  patches,
  selectedId,
  onSelect,
}: {
  patches: CandidateWikiPatch[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const active = patches.find((patch) => patch.id === selectedId) ?? patches[0]

  return (
    <div className={styles.wikiLayout}>
      <div className={styles.wikiList}>
        <div className={styles.paneTitle}>Draft Pages</div>
        {patches.map((patch) => (
          <button
            key={patch.id}
            type="button"
            className={`${styles.wikiPageButton} ${active?.id === patch.id ? styles.recordActive : ''}`}
            onClick={() => onSelect(patch.id)}
          >
            <span>{patch.title}</span>
            <small>{patch.pageSlug}</small>
          </button>
        ))}
      </div>
      <article className={styles.markdownPreview}>
        {active ? (
          <>
            <div className={styles.cardTopline}>
              <span>PROPOSED PATCH</span>
              <span>{formatConfidence(active.confidence)}</span>
            </div>
            <h2>{active.title}</h2>
            <pre>{active.patchMarkdown}</pre>
          </>
        ) : (
          <StateBlock title="No wiki patch" compact />
        )}
      </article>
    </div>
  )
}

function GraphView({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: KnowledgeWorkbenchSnapshot
  selectedId: string
  onSelect: (id: string) => void
}) {
  const nodes = buildGraphNodes(snapshot)

  return (
    <div className={styles.graphCanvas}>
      <svg className={styles.graphLines} viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M18 22 C40 8 62 16 82 25" />
        <path d="M24 72 C42 50 62 46 78 68" />
        <path d="M19 28 C30 48 42 58 56 74" />
        <path d="M50 18 C54 36 58 50 78 68" />
      </svg>
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          className={`${styles.graphNode} ${selectedId === node.id ? styles.graphNodeActive : ''}`}
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
          onClick={() => onSelect(node.id)}
        >
          <span>{node.label}</span>
          <small>{node.kind}</small>
        </button>
      ))}
    </div>
  )
}

function SearchLabView({
  query,
  onQueryChange,
  records,
  modeLabel,
  onSelect,
}: {
  query: string
  onQueryChange: (query: string) => void
  records: SelectedRecord[]
  modeLabel: string
  onSelect: (id: string) => void
}) {
  return (
    <div className={styles.searchLab}>
      <div className={styles.searchPanel}>
        <div className={styles.cardTopline}>
          <span>CONTROLLED RECALL</span>
          <span>{modeLabel}</span>
        </div>
        <input
          className={styles.largeInput}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search facts, wiki patches, observations..."
        />
        <div className={styles.filterRow}>
          <span>workspace</span>
          <span>tag</span>
          <span>file</span>
          <span>source</span>
        </div>
      </div>
      <div className={styles.searchResults}>
        {records.map((record) => (
          <button
            key={record.id}
            type="button"
            className={styles.resultRow}
            onClick={() => onSelect(record.id)}
          >
            <span>{record.title}</span>
            <small>{record.kind} · {record.sourceIds.length} refs</small>
          </button>
        ))}
      </div>
    </div>
  )
}

function AuditView({
  events,
  onSelect,
}: {
  events: AuditEvent[]
  onSelect: (id: string) => void
}) {
  if (events.length === 0) return <StateBlock title="No audit events" />

  return (
    <div className={styles.timeline}>
      {events.map((event) => (
        <button key={event.id} type="button" className={styles.auditEvent} onClick={() => onSelect(event.id)}>
          <span className={styles.auditDot} />
          <span>
            <strong>{event.action}</strong>
            <small>{event.targetType} · {event.targetId}</small>
          </span>
          <time>{formatDate(event.provenance.createdAt)}</time>
        </button>
      ))}
    </div>
  )
}

function Inspector({
  record,
  snapshot,
}: {
  record: SelectedRecord | null
  snapshot: KnowledgeWorkbenchSnapshot | null
}) {
  if (!record) return <StateBlock title="Select a knowledge record" compact />

  return (
    <div className={styles.inspector}>
      <div className={styles.paneTitle}>Provenance</div>
      <div className={styles.inspectorTitle}>{record.title}</div>
      <p>{record.body}</p>
      {record.confidence !== undefined && <Metric label="Confidence" value={formatConfidence(record.confidence)} />}
      <TagRow tags={record.tags} />
      <KeyValue label="Actor" value={record.actor ?? 'unknown'} />
      <KeyValue label="Created" value={formatDate(record.createdAt)} />
      <KeyValue label="Source Refs" value={record.sourceIds.join(', ') || 'none'} />
      <KeyValue label="Files" value={record.fileRefs.join(', ') || 'none'} />
      <div className={styles.actionRow}>
        <button type="button" disabled>Approve</button>
        <button type="button" disabled>Reject</button>
      </div>
      {snapshot?.usingDemoData && <div className={styles.demoNotice}>Showing demo fallback because no real knowledge records were returned.</div>}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.metric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.keyValue}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  return (
    <div className={styles.tags}>
      {tags.slice(0, 5).map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
  )
}

function StateBlock({ title, detail, compact }: { title: string; detail?: string; compact?: boolean }) {
  return (
    <div className={`${styles.stateBlock} ${compact ? styles.stateBlockCompact : ''}`}>
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  )
}

function findSelectedRecord(snapshot: KnowledgeWorkbenchSnapshot, id: string): SelectedRecord | null {
  return buildSearchRecords(snapshot).find((record) => record.id === id) ?? null
}

function buildSearchRecords(snapshot: KnowledgeWorkbenchSnapshot): SelectedRecord[] {
  return [
    ...snapshot.factCandidates.map(recordFromFact),
    ...snapshot.wikiPatches.map(recordFromWikiPatch),
    ...snapshot.graphCandidates.map(recordFromGraph),
    ...snapshot.observations.map(recordFromObservation),
    ...snapshot.auditEvents.map(recordFromAudit),
  ]
}

function recordFromFact(candidate: CandidateFact): SelectedRecord {
  return {
    kind: 'fact',
    id: candidate.id,
    title: candidate.fact.content,
    body: candidate.fact.concepts.join(' · '),
    confidence: candidate.fact.confidence,
    tags: candidate.fact.tags,
    sourceIds: candidate.fact.provenance.sourceObservationIds,
    fileRefs: candidate.fact.provenance.fileRefs,
    actor: candidate.fact.provenance.actor,
    createdAt: candidate.fact.provenance.createdAt,
  }
}

function recordFromWikiPatch(patch: CandidateWikiPatch): SelectedRecord {
  return {
    kind: 'wiki',
    id: patch.id,
    title: patch.title,
    body: patch.rationale,
    confidence: patch.confidence,
    tags: [patch.pageSlug],
    sourceIds: patch.provenance.sourceObservationIds,
    fileRefs: patch.provenance.fileRefs,
    actor: patch.provenance.actor,
    createdAt: patch.provenance.createdAt,
  }
}

function recordFromGraph(candidate: CandidateGraphEdge): SelectedRecord {
  return {
    kind: 'graph',
    id: candidate.id,
    title: `${candidate.edge.from} -> ${candidate.edge.to}`,
    body: candidate.edge.type,
    confidence: candidate.edge.confidence,
    tags: [candidate.edge.type],
    sourceIds: candidate.edge.sourceFactIds,
    fileRefs: [],
    createdAt: candidate.edge.createdAt,
  }
}

function recordFromObservation(observation: Observation): SelectedRecord {
  return {
    kind: 'observation',
    id: observation.id,
    title: observation.summary || observation.content,
    body: observation.content,
    tags: observation.tags,
    sourceIds: [observation.id],
    fileRefs: observation.fileRefs,
    actor: observation.actor,
    createdAt: observation.createdAt,
  }
}

function recordFromAudit(event: AuditEvent): SelectedRecord {
  return {
    kind: 'audit',
    id: event.id,
    title: event.action,
    body: `${event.targetType}:${event.targetId}`,
    tags: [event.targetType],
    sourceIds: event.provenance.sourceObservationIds,
    fileRefs: event.provenance.fileRefs,
    actor: event.provenance.actor,
    createdAt: event.provenance.createdAt,
  }
}

function recordFromSearchHit(hit: KnowledgeSearchHit): SelectedRecord {
  return {
    kind: hit.type === 'memory-fact' ? 'fact' : hit.type === 'wiki-patch' ? 'wiki' : hit.type === 'graph-candidate' ? 'graph' : 'observation',
    id: hit.id,
    title: hit.title,
    body: `${hit.content}\nscore=${hit.score.toFixed(3)}`,
    confidence: hit.confidence,
    tags: hit.tags,
    sourceIds: hit.sourceObservationIds,
    fileRefs: hit.fileRefs,
    actor: hit.source,
    createdAt: hit.createdAt,
  }
}

function buildGraphNodes(snapshot: KnowledgeWorkbenchSnapshot) {
  const base = [
    { id: snapshot.factCandidates[0]?.id ?? 'fact-node', label: 'Candidate Fact', kind: 'fact', x: 18, y: 22 },
    { id: snapshot.wikiPatches[0]?.id ?? 'wiki-node', label: 'Wiki Patch', kind: 'wiki', x: 50, y: 18 },
    { id: snapshot.graphCandidates[0]?.id ?? 'edge-node', label: 'Graph Edge', kind: 'graph', x: 82, y: 25 },
    { id: snapshot.observations[0]?.id ?? 'obs-node', label: 'Observation', kind: 'evidence', x: 24, y: 72 },
    { id: snapshot.factCandidates[1]?.id ?? 'search-node', label: 'BM25 Recall', kind: 'search', x: 78, y: 68 },
  ]

  return base
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatDate(value?: string): string {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
