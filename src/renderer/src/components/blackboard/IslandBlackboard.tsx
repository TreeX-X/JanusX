import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Plus, RefreshCw, X } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'
import { useBlueprintStore } from '@/stores/blueprint'
import { useI18n } from '@/i18n/useI18n'
import { getBlueprintStatusVisual } from '../blueprint/blueprintStatus'
import { LocalFileStage } from '../product-workspace/LocalFileStage'
import './island-blackboard.css'

/* ════════════════════════════════════════════════════════════
   IslandBlackboard —— 岛下拉副黑板（卷帘）
   Note: .agents/notes/workbench/island-blackboard.md
   判据「中断代价」：板上只放可恢复的投影钉（蓝图活图 / html / md）。
   收板零代价：html 卸载即可，浏览器原生视图按下缘让出顶带。
   ════════════════════════════════════════════════════════════ */

const TITLEBAR_HEIGHT = 38
const HEIGHT_KEY = 'janus:blackboard-height'
const PINS_KEY = 'janus:blackboard-pins'
const DEFAULT_HEIGHT = 420
const MIN_HEIGHT = 220

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

function loadHeight(): number {
  try {
    const raw = Number(window.localStorage.getItem(HEIGHT_KEY))
    if (Number.isFinite(raw) && raw >= MIN_HEIGHT) return raw
  } catch { /* persistence is best-effort */ }
  return DEFAULT_HEIGHT
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
  const open = useAppStore((s) => s.blackboardOpen)
  const setBlackboardOpen = useAppStore((s) => s.setBlackboardOpen)
  const activeWorkspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null)
  const workspacePath = activeWorkspace?.path ?? ''
  const [height, setHeight] = useState(loadHeight)
  const [pins, setPins] = useState<FilePin[]>(loadPins)
  const [activeTab, setActiveTab] = useState<ActiveTab>('blueprint')
  const [pinDraft, setPinDraft] = useState('')
  const boardRef = useRef<HTMLDivElement | null>(null)

  const persistPins = useCallback((next: FilePin[]) => {
    try {
      const slim: PersistedPin[] = next.map(({ relPath, follow }) => ({ relPath, follow }))
      window.localStorage.setItem(PINS_KEY, JSON.stringify(slim))
    } catch { /* persistence is best-effort */ }
  }, [])

  /*-- 板下缘视口 Y：原生浏览器视图的 bounds 上报按此让出顶带 --*/
  useEffect(() => {
    if (!open) {
      useAppStore.getState().setBlackboardBottom(0)
      return
    }
    const publish = () => {
      const board = boardRef.current
      if (!board) return
      useAppStore.getState().setBlackboardBottom(Math.round(board.getBoundingClientRect().bottom))
    }
    publish()
    window.addEventListener('resize', publish)
    return () => {
      window.removeEventListener('resize', publish)
      useAppStore.getState().setBlackboardBottom(0)
    }
  }, [open, height])

  /*-- Esc 收板：焦点在 iframe 内时 Esc 归钉住的页面本身 --*/
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const active = document.activeElement
      if (active && (active.tagName === 'IFRAME' || active instanceof HTMLIFrameElement)) return
      setBlackboardOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setBlackboardOpen])

  /*-- 跟随文件：钉住源文件变更即重读（投影钉可随时刷新，符合中断代价判据） --*/
  useEffect(() => {
    if (!open || !workspacePath || !pins.some((pin) => pin.follow)) return
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
  }, [open, workspacePath, pins])

  const addPin = useCallback(() => {
    const relPath = normalizeRelPath(pinDraft, workspacePath)
    const kind = detectPinKind(relPath)
    if (!relPath || !kind) return
    const id = `pin:${relPath}`
    setPins((prev) => {
      const existing = prev.find((pin) => pin.id === id)
      if (existing) return prev
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
    const absolute = joinWorkspacePath(workspacePath, pin.relPath)
    if (pin.kind === 'html') {
      const fileUrl = 'file:///' + absolute.replace(/\\/g, '/')
      void useWorkspaceStore.getState().openBrowserInWorkspace(fileUrl)
      setBlackboardOpen(false)
    }
  }, [workspacePath, setBlackboardOpen])

  /*-- 下缘拖高：9px 命中区，与工作区分隔线同语言 --*/
  const onEdgePointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height
    const move = (ev: PointerEvent) => {
      const next = Math.min(Math.max(startHeight + (ev.clientY - startY), MIN_HEIGHT), window.innerHeight * 0.7)
      setHeight(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try { window.localStorage.setItem(HEIGHT_KEY, String(Math.round(height))) } catch { /* best-effort */ }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [height])

  const activePin = useMemo(
    () => (activeTab === 'blueprint' ? null : pins.find((pin) => pin.id === activeTab) ?? null),
    [activeTab, pins],
  )

  if (!open) return null

  return (
    <section
      ref={boardRef}
      className="island-blackboard"
      style={{ top: TITLEBAR_HEIGHT, height }}
      aria-label={t('janus:blackboard.title')}
    >
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
          <button type="button" className="bb-action" onClick={() => setBlackboardOpen(false)} title={t('janus:blackboard.close')}>
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
    </section>
  )
}

function BlueprintLivePin() {
  const { t } = useI18n('janus')
  const setActiveWorkbench = useAppStore((s) => s.setActiveWorkbench)
  const setBlackboardOpen = useAppStore((s) => s.setBlackboardOpen)
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
          setBlackboardOpen(false)
        }}
      >
        {t('janus:blackboard.blueprint.openWorkbench')}
      </button>
    </div>
  )
}
