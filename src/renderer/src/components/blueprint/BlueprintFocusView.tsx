import type { CSSProperties } from 'react'
import { useAppStore } from '@/stores/app'
import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import type { BlueprintNode } from '@/services/blueprint'
import { STATUS_VISUALS } from './blueprintStatus'
import './blueprint.css'

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
}

function getLatestAnalysis(node: BlueprintNode) {
  return node.analyses?.length ? node.analyses[node.analyses.length - 1] : null
}

export function BlueprintFocusView() {
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const activeSession = useBlueprintStore((s) => s.activeSession)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const terminals = useWorkspaceStore((s) => s.terminals)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const setActiveTerminal = useWorkspaceStore((s) => s.setActiveTerminal)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)
  const setLoadState = useAppStore((s) => s.setLoadState)
  const setActiveWorkbench = useAppStore((s) => s.setActiveWorkbench)

  const activeNode =
    activeSession && currentBlueprint?.id === activeSession.blueprintId
      ? currentBlueprint.nodes[activeSession.nodeId] ?? activeSession.nodeSnapshot
      : activeSession?.nodeSnapshot ?? null
  const visual = activeNode ? STATUS_VISUALS[activeNode.status] ?? STATUS_VISUALS['not-started'] : null
  const progress = activeNode ? clampProgress(activeNode.progress) : 0
  const latestAnalysis = activeNode ? getLatestAnalysis(activeNode) : null
  const workspace = activeNode?.workspaceId ? workspaces.find((item) => item.id === activeNode.workspaceId) : null
  const boundTerminal = activeNode?.boundTerminalId
    ? terminals.find((terminal) => terminal.id === activeNode.boundTerminalId)
    : null

  const openWorkbench = () => setActiveWorkbench('blueprint')
  const exitFocus = () => setBlueprintMode(false)
  const openBoundTerminal = () => {
    if (!activeNode?.workspaceId || !boundTerminal) return
    setActiveWorkspace(activeNode.workspaceId)
    setActiveTerminal(boundTerminal.id)
    setLoadState('terminal-active')
    setBlueprintMode(false)
  }

  if (!activeNode) {
    return (
      <div className="blueprint-focus-view blueprint-focus-view--empty">
        <div className="blueprint-focus-empty-panel">
          <div className="blueprint-focus-kicker">BLUEPRINT FOCUS MODE</div>
          <h2>No active blueprint node</h2>
          <p>Open the workbench, choose a node, then start work to pin that node here.</p>
          <div className="blueprint-focus-actions">
            <button type="button" className="blueprint-btn blueprint-btn--primary" onClick={openWorkbench}>
              Open Workbench
            </button>
            <button type="button" className="blueprint-btn" onClick={exitFocus}>
              Back to Terminal
            </button>
          </div>
        </div>
      </div>
    )
  }

  const featurePreview = (activeNode.features ?? []).slice(0, 4)
  const issuePreview = (activeNode.issues ?? []).filter((issue) => issue.status === 'open').slice(0, 3)

  return (
    <div className="blueprint-focus-view">
      <div className="blueprint-focus-grid">
        <section className="blueprint-focus-hero">
          <div className="blueprint-focus-topline">
            <span className="blueprint-focus-kicker">BLUEPRINT FOCUS MODE</span>
            <span className="blueprint-focus-state" style={{ color: visual?.color }}>
              {visual?.label ?? activeNode.status}
            </span>
          </div>
          <h2>{activeNode.title || 'Untitled node'}</h2>
          <p>{activeNode.description || activeNode.positioning || 'No node description yet.'}</p>

          <div
            className="blueprint-focus-progress"
            style={{ '--focus-color': visual?.color ?? '#ff7830', '--focus-progress': progress } as CSSProperties}
          >
            <div className="blueprint-focus-progress-ring">
              <span>{progress}%</span>
            </div>
            <div className="blueprint-focus-progress-copy">
              <span>{currentBlueprint?.name ?? 'Blueprint'}</span>
              <strong>{workspace?.name ?? activeNode.workspaceSnapshot?.name ?? 'No workspace bound'}</strong>
            </div>
          </div>

          <div className="blueprint-focus-actions">
            <button type="button" className="blueprint-btn blueprint-btn--primary" onClick={openWorkbench}>
              Open Workbench
            </button>
            <button type="button" className="blueprint-btn" onClick={openBoundTerminal} disabled={!boundTerminal}>
              {boundTerminal ? 'Open Terminal' : 'No Terminal'}
            </button>
            <button type="button" className="blueprint-btn" onClick={exitFocus}>
              Back to Terminal
            </button>
          </div>
        </section>

        <aside className="blueprint-focus-panel">
          <div className="blueprint-focus-panel-head">
            <span>Execution Snapshot</span>
            <strong>{activeSession?.workspaceName ?? workspace?.name ?? 'Workspace'}</strong>
          </div>
          <div className="blueprint-focus-stat-row">
            <div>
              <span>Features</span>
              <strong>{activeNode.features?.length ?? 0}</strong>
            </div>
            <div>
              <span>Open Issues</span>
              <strong>{issuePreview.length}</strong>
            </div>
            <div>
              <span>Terminal</span>
              <strong>{boundTerminal ? 'Bound' : 'None'}</strong>
            </div>
          </div>

          <div className="blueprint-focus-section">
            <label>Requirements</label>
            {featurePreview.length ? (
              featurePreview.map((feature) => (
                <div className="blueprint-focus-list-item" key={feature.id}>
                  <strong>{feature.title}</strong>
                  <span>{feature.status} / {clampProgress(feature.progress)}%</span>
                </div>
              ))
            ) : (
              <div className="blueprint-focus-empty-line">No requirements captured.</div>
            )}
          </div>

          <div className="blueprint-focus-section">
            <label>Open Issues</label>
            {issuePreview.length ? (
              issuePreview.map((issue) => (
                <div className="blueprint-focus-list-item" key={issue.id}>
                  <strong>{issue.title}</strong>
                  <span>{issue.severity}</span>
                </div>
              ))
            ) : (
              <div className="blueprint-focus-empty-line">No open issues.</div>
            )}
          </div>

          <div className="blueprint-focus-section">
            <label>Latest Janus Analysis</label>
            {latestAnalysis ? (
              <div className="blueprint-focus-analysis">
                <strong>{latestAnalysis.result.summary || latestAnalysis.error || 'No summary'}</strong>
                <span>
                  {new Date(latestAnalysis.createdAt).toLocaleString()} / {latestAnalysis.applied ? 'applied' : 'not applied'}
                </span>
              </div>
            ) : (
              <div className="blueprint-focus-empty-line">No analysis yet.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
