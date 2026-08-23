import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Download, Play, Square, UsersRound, X } from 'lucide-react'
import type { RoundtableProgressEvent, RoundtableSession, RoundtableRole, RoundtableWorkspaceDependency } from '../../../../shared/ipc/janus-roundtable'
import type { JanusResourceController, Message } from './useJanusChat'
import { JanusIdentityCore } from './JanusIdentityCore'
import { roundtableMessagesToChat } from './roundtable-chat'

interface JanusRoundtablePaneProps {
  className?: string
  onClose: () => void
  initialSessionId?: string
  embedded?: boolean
  resourceController: JanusResourceController
  center?: (onSend: (text: string) => void, messages: Message[], workingRole: RoundtableRole | null) => ReactNode
}

const roleLabels = [
  { id: 'host' as const, name: 'JanusX', label: '主持人', identity: 'main' as const },
  { id: 'agent-1' as const, name: 'Agent-1', label: '议题解决者', identity: 'coder' as const },
  { id: 'agent-2' as const, name: 'Agent-2', label: '议题完善者', identity: 'evaluator' as const },
]

export function JanusRoundtablePane({ className, onClose, initialSessionId, embedded = false, resourceController, center }: JanusRoundtablePaneProps) {
  const api = window.electron.janusRoundtable
  const [session, setSession] = useState<RoundtableSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [workingRole, setWorkingRole] = useState<RoundtableRole | null>(null)
  const activeSessionIdRef = useRef(initialSessionId)
  const sessionRef = useRef<RoundtableSession | null>(null)
  const hydratedSessionRef = useRef(false)

  useEffect(() => {
    if (!api || !session || !hydratedSessionRef.current || resourceController.resources.length === 0 || busy) return
    const workspaces: RoundtableWorkspaceDependency[] = resourceController.resources.map((resource) => ({
      workspaceId: resource.workspaceId,
      workspacePath: resource.workspacePath,
      workspaceName: resource.workspaceName,
    }))
    const current = session.workspaces ?? (session.workspaceId && session.workspacePath ? [{ workspaceId: session.workspaceId, workspacePath: session.workspacePath, workspaceName: session.workspaceId }] : [])
    if (JSON.stringify(current) === JSON.stringify(workspaces)) return
    void api.updateWorkspaces({ sessionId: session.id, workspaces }).then((updated) => {
      sessionRef.current = updated
      setSession(updated)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '工作区依赖更新失败'))
  }, [api, busy, resourceController.resources, session])

  useEffect(() => {
    activeSessionIdRef.current = initialSessionId
    if (!api || !initialSessionId) return
    let cancelled = false
    setBusy(true)
    void api.get(initialSessionId).then((loaded) => {
      if (cancelled) return
      if (!loaded) {
        setError('无法恢复圆桌会议')
        return
      }
      sessionRef.current = loaded
      setSession(loaded)
      const dependencies = loaded.workspaces ?? (loaded.workspaceId && loaded.workspacePath ? [{ workspaceId: loaded.workspaceId, workspacePath: loaded.workspacePath, workspaceName: loaded.workspaceId }] : [])
      const attachedIds = new Set(resourceController.resources.map((resource) => resource.workspaceId))
      dependencies.forEach((workspace) => {
        if (!attachedIds.has(workspace.workspaceId)) resourceController.attachWorkspace(workspace.workspaceId)
      })
      hydratedSessionRef.current = true
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '无法恢复圆桌会议')
    }).finally(() => {
      if (!cancelled) setBusy(false)
    })
    return () => { cancelled = true }
  }, [api, initialSessionId])

  useEffect(() => {
    if (!api) return
    return api.onProgress((event: RoundtableProgressEvent) => {
      if (event.sessionId !== activeSessionIdRef.current) return
      setWorkingRole((current) => event.state === 'working' ? event.role : current === event.role ? null : current)
      const update = (current: RoundtableSession | null) => {
        if (!current || current.id !== event.sessionId) return current
        const messages = event.message && !current.messages.some((item) => item.id === event.message?.id)
          ? [...current.messages, event.message]
          : current.messages
        if (messages === current.messages && current.currentRound >= event.round) return current
        return { ...current, currentRound: Math.max(current.currentRound, event.round), messages }
      }
      const next = update(sessionRef.current)
      sessionRef.current = next
      setSession(next)
    })
  }, [api])

  if (!api) return null

  const run = async (action: () => Promise<RoundtableSession>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await action()
      activeSessionIdRef.current = next.id
      sessionRef.current = next
      setSession(next)
      hydratedSessionRef.current = true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '圆桌操作失败')
    } finally {
      setBusy(false)
      setWorkingRole(null)
    }
  }

  const advance = () => {
    if (!session) return
    void run(() => api.advance({ sessionId: session.id }))
  }

  const end = () => {
    if (!session || session.status === 'ended') return
    void run(() => api.end(session.id))
  }

  const exportMarkdown = async () => {
    if (!session) return
    const picked = await window.electron.dialog.openDirectory()
    const directory = picked.filePaths[0]
    if (picked.canceled || !directory) return
    try {
      await api.exportMarkdown(session.id, directory)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导出失败')
    }
  }

  const stopPointerPropagation = (event: ReactPointerEvent) => event.stopPropagation()
  const requestClose = () => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 220)
  }
  const handleCenterSend = (text: string) => {
    if (!text.trim() || busy) return
    if (!session) {
      if (resourceController.resources.length === 0) {
        setError('请先从顶部工作区菜单导入至少一个工作区，再开始圆桌会议')
        return
      }
      void run(async () => {
        const workspaces = resourceController.resources.map((resource) => ({ workspaceId: resource.workspaceId, workspacePath: resource.workspacePath, workspaceName: resource.workspaceName }))
        const created = await api.create({ topic: text, workspaces, workspaceId: workspaces[0].workspaceId, workspacePath: workspaces[0].workspacePath })
        activeSessionIdRef.current = created.id
        sessionRef.current = created
        setSession(created)
        hydratedSessionRef.current = true
        return api.advance({ sessionId: created.id })
      })
      return
    }
    if (session.status === 'active' && !busy) {
      void run(() => api.advance({ sessionId: session.id, userInput: text }))
    }
  }

  return (
    <div
      className={`janus-roundtable-overlay${embedded ? ' janus-roundtable-overlay--embedded' : ''}${closing ? ' janus-roundtable-overlay--closing' : ''}${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-modal={!embedded}
      aria-label="圆桌会议"
      onPointerDown={stopPointerPropagation}
      onPointerMove={stopPointerPropagation}
      onPointerUp={stopPointerPropagation}
      onPointerCancel={stopPointerPropagation}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="janus-roundtable-panel">
        <header className="janus-roundtable-header">
          <div className="janus-roundtable-title">
            <UsersRound size={16} aria-hidden="true" />
            <span>{session?.title ?? '圆桌会议'}</span>
            {session && <small>第 {session.currentRound} 轮 · {session.status === 'active' ? '进行中' : '已结束'}</small>}
            {!session && <small>准备开始</small>}
          </div>
          <button type="button" className="janus-roundtable-icon" onClick={requestClose} title="关闭"><X size={15} /></button>
        </header>

        <div className="janus-roundtable-body">
              <aside className="janus-roundtable-participants" aria-label="参与者">
                <div className="janus-roundtable-section-label">参与者</div>
                <div className="janus-roundtable-role user"><span className="janus-roundtable-user-mark">U</span><span><strong>用户</strong><small>提议人</small></span></div>
                {roleLabels.map((role, index) => {
                  const isWorking = workingRole === role.id
                  const status = isWorking ? '工作中' : session?.status === 'ended' ? '已完成' : '待命'
                  return <div className={`janus-roundtable-role janus-roundtable-role--enter-${index + 1}`} data-working={isWorking} key={role.id}><JanusIdentityCore identity={role.identity} size="pod" state={isWorking ? 'running' : session?.status === 'ended' ? 'done' : 'default'} showHalo={false} showScanline={false} /><span><strong>{role.name}</strong><small>{role.label}</small><em>{status}</em></span></div>
                })}
              </aside>
              <main className="janus-roundtable-center">{center?.(handleCenterSend, roundtableMessagesToChat(session?.messages ?? [], workingRole, session?.currentRound ?? 0), workingRole)}</main>
              <aside className="janus-roundtable-state"><div className="janus-roundtable-section-label">共享文档{session ? ` v${session.sharedState.version}` : ''}</div>{session ? [['需求', session.sharedState.requirements], ['待解决', session.sharedState.openIssues], ['已解决', session.sharedState.resolvedIssues], ['方案', session.sharedState.proposals], ['风险', session.sharedState.risks], ['行动项', session.sharedState.actionItems]].map(([label, items]) => <section key={label as string}><strong>{label as string}</strong>{(items as string[]).length ? (items as string[]).map((item, index) => <p key={`${label}-${index}`}>{item}</p>) : <small>暂无</small>}</section>) : <small>开始会议后，JanusX 会在此整理共享结构化数据。</small>}
                <div className="janus-roundtable-controls">
                  {session?.status === 'active' && <><button type="button" className="janus-roundtable-primary" disabled={busy} onClick={advance}><Play size={14} /> 下一轮</button><button type="button" className="janus-roundtable-danger" disabled={busy} onClick={end}><Square size={13} /> 结束</button></>}
                  {session?.status === 'ended' && <button type="button" className="janus-roundtable-primary" onClick={() => void exportMarkdown()}><Download size={14} /> 导出 Markdown</button>}
                </div>
              </aside>
              {error && <div className="janus-roundtable-error" role="alert">{error}</div>}
            </div>
      </div>
    </div>
  )
}
