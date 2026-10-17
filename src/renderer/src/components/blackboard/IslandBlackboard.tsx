import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Plus, RefreshCw, X } from 'lucide-react'
import { useAppStore, BLACKBOARD_MIN_HEIGHT, saveBlackboardHeight } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'
import { useBlueprintStore } from '@/stores/blueprint'
import { useI18n } from '@/i18n/useI18n'
import { getBlueprintStatusVisual } from '../blueprint/blueprintStatus'
import { LocalFileStage } from '../product-workspace/LocalFileStage'
import './island-blackboard.css'

/* ════════════════════════════════════════════════════════════
   IslandBlackboard —— 岛下拉副黑板
   Note: .agents/notes/workbench/island-blackboard.md

   形态：中部工作区列内的上带。下拉手势把主工作区下滑让位，
   板在空出的上带里长出——不是从顶部盖下的卷帘，也不碰左右栏架。
   判据「中断代价」：板上只放可恢复的投影钉（蓝图活图 / html / md）。
   ════════════════════════════════════════════════════════════ */

const PINS_KEY = 'janus:blackboard-pins'

const TEXT_PIN_PATTERN = /\.(txt|json|css|js|ts|tsx|mjs|cjs|yml|yaml|log)$/i

type PinKind = 'html' | 'markdown' | 'text'

interface FilePin {
  id: string
  kind: PinKind
  relPath: string
  follow: boolean
  revision: number
}

interface PersistedPin {
  relPath: string
  follow: boolean
}

type ActiveTab = 'blueprint' | string

function detectPinKind(relPath: string): PinKind | null {
  if (/\.html?$/i.test(relPath)) return 'html'
  if (/\.md$/i.test(relPath)) return 'markdown'
  if (TEXT_PIN_PATTERN.test(relPath)) return 'text'
  return null
}

function normalizeRelPath(input: string, workspacePath: string): string {
  let value = input.trim().replace(/\\/g, '/')
  if (!value) return ''
  const root = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')
  if (root && value.startsWith(root + '/')) value = value.slice(root.length + 1)
  return value.replace(/^\.?\//, '')
}

function joinWorkspacePath(workspacePath: string, relPath: string): string {
  const trimmed = workspacePath.replace(/[/\\]+$/, '')
  const separator = trimmed.includes('\\') ? '\\' : '/'
  return `${trimmed}${separator}${relPath.split('/').join(separator)}`
}

function loadPins(): FilePin[] {
  try {
    const raw = window.localStorage.getItem(PINS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PersistedPin[]
    return parsed
      .filter((item): item is PersistedPin => Boolean(item && typeof item.relPath === 'string'))
      .map((item) => {
        const kind = detectPinKind(item.relPath)
        return kind ? { id: `pin:${item.relPath}`, kind, relPath: item.relPath, follow: item.follow === true, revision: 0 } : null
      })
      .filter((pin): pin is FilePin => pin !== null)
  } catch {
    return []
  }
}

export function IslandBlackboard() {
  const { t } = useI18n('janus')
  const blackboardHeight = useAppStore((s) => s.blackboardHeight)
  const blackboardDrag = useAppStore((s) => s.blackboardDrag)
  const setBlackboardHeight = useAppStore((s) => s.setBlackboardHeight)
  const activeWorkspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null)
  const workspacePath = activeWorkspace?.path ?? ''
  const [pins, setPins] = useState<FilePin[]>(loadPins)
  const [activeTab, setActiveTab] = useState<ActiveTab>('blueprint')
  const [pinDraft, setPinDraft] = useState('')
  const boardRef = useRef<HTMLDivElement | null>(null)

  /*-- 拖拽预览跟手；落点/收起用 settled 高度 --*/
  const dragging = blackboardDrag !== null
  const effectiveHeight = dragging ? blackboardDrag : blackboardHeight

  const persistPins = useCallback((next: FilePin[]) => {
    try {
      const slim: PersistedPin[] = next.map(({ relPath, follow }) => ({ relPath, follow }))
      window.localStorage.setItem(PINS_KEY, JSON.stringify(slim))
    } catch { /* persistence is best-effort */ }
  }, [])

  const persistHeight = useCallback((height: number) => {
    saveBlackboardHeight(height)
  }, [])

  const close = useCallback(() => {
    useAppStore.getState().setBlackboardDrag(null)
    setBlackboardHeight(0)
  }, [setBlackboardHeight])

  /*-- Esc 收板：焦点在 iframe 内时 Esc 归钉住的页面本身 --*/
  useEffect(() => {
    if (blackboardHeight === 0 && blackboardDrag === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const active = document.activeElement
      if (active && (active.tagName === 'IFRAME' || active instanceof HTMLIFrameElement)) return
      close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [blackboardHeight, blackboardDrag, close])

  /*-- 跟随文件：钉住源文件变更即重读（投影钉可随时刷新，符合中断代价判据） --*/
  useEffect(() => {
    if (effectiveHeight === 0 || !workspacePath || !pins.some((pin) => pin.follow)) return
    const dispose = window.electron.fileTree.onChanged(({ changedFilePath }) => {
      if (!changedFilePath) return
      const normalized = changedFilePath.replace(/\\/g, '/').toLowerCase()
      setPins((prev) => prev.map((pin) => {
        if (!pin.follow) return pin
        const absolute = joinWorkspacePath(workspacePath, pin.relPath).replace(/\\/g, '/').toLowerCase()
        if (normalized !== absolute) return pin
        return { ...pin, revision: pin.revision + 1 }
      }))
    })
    return dispose
  }, [effectiveHeight, workspacePath, pins])

  const addPin = useCallback(() => {
    const relPath = normalizeRelPath(pinDraft, workspacePath)
    const kind = detectPinKind(relPath)
    if (!relPath || !kind) return
    const id = `pin:${relPath}`
    setPins((prev) => {
      if (prev.some((pin) => pin.id === id)) return prev
      const next = [...prev, { id, kind, relPath, follow: false, revision: 0 }]
      persistPins(next)
      return next
    })
    setActiveTab(id)
    setPinDraft('')
  }, [pinDraft, workspacePath, persistPins])

  const removePin = useCallback((id: string) => {
    setPins((prev) => {
      const next = prev.filter((pin) => pin.id !== id)
      persistPins(next)
      return next
    })
    setActiveTab((current) => (current === id ? 'blueprint' : current))
  }, [persistPins])

  const toggleFollow = useCallback((id: string) => {
    setPins((prev) => {
      const next = prev.map((pin) => (pin.id === id ? { ...pin, follow: !pin.follow } : pin))
      persistPins(next)
      return next
    })
  }, [persistPins])

  const refreshPin = useCallback((id: string) => {
    setPins((prev) => prev.map((pin) => (pin.id === id ? { ...pin, revision: pin.revision + 1 } : pin)))
  }, [])

  const openRealBody = useCallback((pin: FilePin) => {
    if (pin.kind !== 'html') return
    const absolute = joinWorkspacePath(workspacePath, pin.relPath)
    const fileUrl = 'file:///' + absolute.replace(/\\/g, '/')
    void useWorkspaceStore.getState().openBrowserInWorkspace(fileUrl)
    close()
  }, [workspacePath, close])

  /*-- 下缘拖高/上推收板：9px 命中区，与工作区分隔线同语言 --*/
  const onEdgePointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = blackboardHeight
    const move = (ev: PointerEvent) => {
      const next = Math.min(Math.max(startHeight + (ev.clientY - startY), 0), window.innerHeight * 0.7)
      setBlackboardHeight(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const settled = useAppStore.getState().blackboardHeight
      if (settled < BLACKBOARD_MIN_HEIGHT) {
        close()
      } else {
        persistHeight(settled)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [blackboardHeight, setBlackboardHeight, close, persistHeight])

  const activePin = useMemo(
    () => (activeTab === 'blueprint' ? null : pins.find((pin) => pin.id === activeTab) ?? null),
    [activeTab, pins],
  )

  return (
    <section
      ref={boardRef}
      className="island-blackboard"
      data-dragging={dragging || undefined}
      style={{ height: effectiveHeight }}
      aria-label={t('janus:blackboard.title')}
      aria-hidden={effectiveHeight === 0}
    >
      {effectiveHeight > 0 && (
        <>
          <header className="bb-bar">
            <div className="bb-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'blueprint'}
                className="bb-tab"
                data-active={activeTab === 'blueprint' || undefined}
                onClick={() => setActiveTab('blueprint')}
              >
                {t('janus:blackboard.tab.blueprint')}
              </button>
              {pins.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === pin.id}
                  className="bb-tab"
                  data-active={activeTab === pin.id || undefined}
                  onClick={() => setActiveTab(pin.id)}
                >
                  <span className="bb-tab-path">{pin.relPath}</span>
                  {pin.follow && <span className="bb-follow-mark" aria-hidden="true" />}
                </button>
              ))}
            </div>
            <div className="bb-actions">
              <input
                className="bb-pin-input"
                value={pinDraft}
                placeholder={t('janus:blackboard.pinPlaceholder')}
                onChange={(event) => setPinDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addPin()
                }}
              />
              <button type="button" className="bb-action" onClick={addPin} title={t('janus:blackboard.pin')}>
                <Plus size={12} aria-hidden="true" />
                {t('janus:blackboard.pin')}
              </button>
              {activePin && (
                <>
                  <button type="button" className="bb-action" onClick={() => refreshPin(activePin.id)} title={t('janus:blackboard.refresh')}>
                    <RefreshCw size={12} aria-hidden="true" />
                    {t('janus:blackboard.refresh')}
                  </button>
                  <button
                    type="button"
                    className="bb-action"
                    data-pressed={activePin.follow || undefined}
                    onClick={() => toggleFollow(activePin.id)}
                  >
                    {t('janus:blackboard.follow')}
                  </button>
                  {activePin.kind === 'html' && (
                    <button type="button" className="bb-action" onClick={() => openRealBody(activePin)} title={t('janus:blackboard.openReal')}>
                      <ExternalLink size={12} aria-hidden="true" />
                      {t('janus:blackboard.openReal')}
                    </button>
                  )}
                  <button type="button" className="bb-action" onClick={() => removePin(activePin.id)}>
                    {t('janus:blackboard.unpin')}
                  </button>
                </>
              )}
              <button type="button" className="bb-action" onClick={close} title={t('janus:blackboard.close')}>
                <X size={12} aria-hidden="true" />
                {t('janus:blackboard.close')}
              </button>
            </div>
          </header>

          <div className="bb-slot">
            {activePin ? (
              <LocalFileStage
                key={`${activePin.id}:${activePin.revision}`}
                workspacePath={workspacePath}
                relPath={activePin.relPath}
                kind={activePin.kind}
              />
            ) : (
              <BlueprintLivePin />
            )}
          </div>

          <div
            className="bb-edge"
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('janus:blackboard.title')}
            onPointerDown={onEdgePointerDown}
          />
        </>
      )}
    </section>
  )
}

function BlueprintLivePin() {
  const { t } = useI18n('janus')
  const setActiveWorkbench = useAppStore((s) => s.setActiveWorkbench)
  const setBlackboardHeight = useAppStore((s) => s.setBlackboardHeight)
  const activeSession = useBlueprintStore((s) => s.activeSession)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const activeNode =
    activeSession && currentBlueprint?.id === activeSession.blueprintId
      ? currentBlueprint.nodes[activeSession.nodeId] ?? activeSession.nodeSnapshot
      : activeSession?.nodeSnapshot ?? null
  const visual = activeNode ? getBlueprintStatusVisual(activeNode.status) : null

  return (
    <div className="bb-blueprint">
      <div className="bb-blueprint-head">
        <span className="bb-blueprint-kicker">{t('janus:blackboard.tab.blueprint')}</span>
        {visual && (
          <span className="bb-blueprint-status">
            <span className="bb-status-dot" style={{ background: visual.color }} aria-hidden="true" />
            {t(visual.labelKey)}
          </span>
        )}
      </div>
      {activeNode ? (
        <p className="bb-blueprint-title">{activeNode.title}</p>
      ) : (
        <p className="bb-blueprint-empty">{t('janus:blackboard.blueprint.empty')}</p>
      )}
      <button
        type="button"
        className="bb-action bb-blueprint-open"
        onClick={() => {
          setActiveWorkbench('blueprint')
          setBlackboardHeight(0)
        }}
      >
        {t('janus:blackboard.blueprint.openWorkbench')}
      </button>
    </div>
  )
}
