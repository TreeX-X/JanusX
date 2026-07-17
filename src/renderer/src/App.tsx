import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCheckpointStore } from '@/stores/checkpoint'
import { useOfficeStore } from '@/stores/office'
import { Titlebar } from '@/components/Titlebar'
import { Sidebar } from '@/components/Sidebar'
import { TerminalArea } from '@/components/TerminalArea'
import { TerminalSelector } from '@/components/TerminalSelector'
import { Panel } from '@/components/Panel'
import { OfficePreviewPanel } from '@/components/office/OfficePreviewPanel'
import {
  clampOfficePreviewWidth,
  getOfficePreviewMaxWidth,
  OFFICE_PREVIEW_MAX_WIDTH,
  OFFICE_PREVIEW_MIN_WIDTH,
  reconcileOfficePreviewWidth,
} from '@/components/office/officeResize'
import { StatusBar } from '@/components/StatusBar'
import { FileEditor } from '@/components/FileEditor'
import { AgentNotificationHost } from '@/components/AgentNotificationHost'
import { JanusChatProvider } from '@/components/janus/JanusChatProvider'
import { BlueprintFocusView } from '@/components/blueprint/BlueprintFocusView'
import { warmupEditorRuntime } from '@/lib/editor-warmup'
import { warmDefaultShellCache, warmTerminalCreatePath } from '@/lib/terminal-launch'
import { useWorkspaceBootstrap } from '@/features/workspace/useWorkspaceBootstrap'
import { chooseAndCreateWorkspace } from '@/features/workspace/actions'

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

const SIDE_PANEL_WIDTH = 'clamp(240px, 14vw, 280px)'
const SIDE_PANEL_COLLAPSED_WIDTH = '48px'
const OFFICE_PREVIEW_WIDTH = 'clamp(300px, 30vw, 480px)'
const OFFICE_CLOSE_DURATION_MS = 200
const OFFICE_CLOSE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

interface OfficeResizeSession {
  pointerId: number
  target: HTMLDivElement
  officeRightEdge: number
  resizableWorkspaceWidth: number
}

export default function App() {
  useWorkspaceBootstrap()
  const { loadState, sidebarCollapsed, panelCollapsed, blueprintMode, isIslandDragging, flipDuration, dragFlipProgress } = useAppStore()
  const subscribeToCheckpointEvents = useCheckpointStore((s) => s.subscribeToEvents)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const visibleOfficeWorkspaceId = useOfficeStore((s) => s.visibleWorkspaceId)
  const officeVisible = visibleOfficeWorkspaceId !== null && visibleOfficeWorkspaceId === activeWorkspaceId
  const [officeClosing, setOfficeClosing] = useState(false)
  const [officeWidth, setOfficeWidth] = useState<number | null>(null)
  const [officeMeasuredWidth, setOfficeMeasuredWidth] = useState(OFFICE_PREVIEW_MIN_WIDTH)
  const [officeMaxWidth, setOfficeMaxWidth] = useState(OFFICE_PREVIEW_MAX_WIDTH)
  const [officeResizing, setOfficeResizing] = useState(false)
  const officeCloseTimerRef = useRef<number | null>(null)
  const centerWorkspaceRef = useRef<HTMLElement | null>(null)
  const officeWorkspaceRef = useRef<HTMLElement | null>(null)
  const officeResizeSessionRef = useRef<OfficeResizeSession | null>(null)
  const bodyInteractionStyleRef = useRef<{ cursor: string; userSelect: string } | null>(null)
  const officeRendered = officeVisible || officeClosing

  const reconcileOfficeLayout = useCallback(() => {
    if (!officeVisible || officeClosing || !centerWorkspaceRef.current || !officeWorkspaceRef.current) return
    const officeRect = officeWorkspaceRef.current.getBoundingClientRect()
    const centerRect = centerWorkspaceRef.current.getBoundingClientRect()
    const resizableWorkspaceWidth = officeRect.width + centerRect.width
    const maxWidth = getOfficePreviewMaxWidth(resizableWorkspaceWidth)

    setOfficeMeasuredWidth((current) => Math.abs(current - officeRect.width) < 0.5 ? current : officeRect.width)
    setOfficeMaxWidth((current) => Math.abs(current - maxWidth) < 0.5 ? current : maxWidth)
    setOfficeWidth((current) => {
      const { width } = reconcileOfficePreviewWidth(current, officeRect.width, resizableWorkspaceWidth)
      return current !== null && Math.abs(current - width) < 0.5 ? current : width
    })
  }, [officeClosing, officeVisible])

  useLayoutEffect(() => {
    if (!officeVisible || officeClosing || !centerWorkspaceRef.current || !officeWorkspaceRef.current) return
    const centerWorkspace = centerWorkspaceRef.current
    const officeWorkspace = officeWorkspaceRef.current
    let frameId: number | null = null
    const observer = new ResizeObserver(() => {
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        reconcileOfficeLayout()
      })
    })

    reconcileOfficeLayout()
    observer.observe(centerWorkspace)
    observer.observe(officeWorkspace)
    return () => {
      observer.disconnect()
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
  }, [officeClosing, officeVisible, reconcileOfficeLayout])

  const finishOfficeResize = useCallback((updateState = true) => {
    const session = officeResizeSessionRef.current
    if (session?.target.hasPointerCapture(session.pointerId)) {
      session.target.releasePointerCapture(session.pointerId)
    }
    officeResizeSessionRef.current = null
    if (updateState) setOfficeResizing(false)
    if (bodyInteractionStyleRef.current) {
      document.body.style.cursor = bodyInteractionStyleRef.current.cursor
      document.body.style.userSelect = bodyInteractionStyleRef.current.userSelect
      bodyInteractionStyleRef.current = null
    }
  }, [])

  const handleOfficeResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (officeClosing || event.button !== 0 || !centerWorkspaceRef.current || !officeWorkspaceRef.current) return

    finishOfficeResize()
    const officeRect = officeWorkspaceRef.current.getBoundingClientRect()
    const centerRect = centerWorkspaceRef.current.getBoundingClientRect()
    officeResizeSessionRef.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      officeRightEdge: officeRect.right,
      resizableWorkspaceWidth: officeRect.width + centerRect.width,
    }
    setOfficeMaxWidth(getOfficePreviewMaxWidth(officeRect.width + centerRect.width))
    bodyInteractionStyleRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    event.currentTarget.setPointerCapture(event.pointerId)
    setOfficeWidth(officeRect.width)
    setOfficeResizing(true)
    event.preventDefault()
  }, [finishOfficeResize, officeClosing])

  const handleOfficeResizeMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = officeResizeSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    setOfficeWidth(clampOfficePreviewWidth(
      event.clientX,
      session.officeRightEdge,
      session.resizableWorkspaceWidth,
    ))
  }, [])

  const handleOfficeResizeEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (officeResizeSessionRef.current?.pointerId !== event.pointerId) return
    finishOfficeResize()
  }, [finishOfficeResize])

  const handleOfficeResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!centerWorkspaceRef.current || !officeWorkspaceRef.current) return
    const officeRect = officeWorkspaceRef.current.getBoundingClientRect()
    const centerRect = centerWorkspaceRef.current.getBoundingClientRect()
    const maxWidth = getOfficePreviewMaxWidth(officeRect.width + centerRect.width)
    const widthByKey: Partial<Record<string, number>> = {
      ArrowLeft: Math.min(maxWidth, officeRect.width + 16),
      ArrowRight: Math.max(OFFICE_PREVIEW_MIN_WIDTH, officeRect.width - 16),
      Home: OFFICE_PREVIEW_MIN_WIDTH,
      End: maxWidth,
    }
    const nextWidth = widthByKey[event.key]
    if (nextWidth === undefined) return
    setOfficeMaxWidth(maxWidth)
    setOfficeWidth(nextWidth)
    event.preventDefault()
  }, [])

  const handleCloseOffice = useCallback(() => {
    if (officeCloseTimerRef.current !== null || visibleOfficeWorkspaceId === null) return

    finishOfficeResize()
    const closingWorkspaceId = visibleOfficeWorkspaceId
    setOfficeClosing(true)
    officeCloseTimerRef.current = window.setTimeout(() => {
      officeCloseTimerRef.current = null
      if (useOfficeStore.getState().visibleWorkspaceId === closingWorkspaceId) {
        useOfficeStore.getState().closeOfficeSpace()
      }
      setOfficeClosing(false)
    }, OFFICE_CLOSE_DURATION_MS)
  }, [finishOfficeResize, visibleOfficeWorkspaceId])

  useEffect(() => {
    return () => {
      if (officeCloseTimerRef.current !== null) {
        window.clearTimeout(officeCloseTimerRef.current)
      }
      finishOfficeResize(false)
    }
  }, [finishOfficeResize])

  useEffect(() => {
    if (officeVisible) useAppStore.getState().setPanelCollapsed(true)
  }, [officeVisible])

  /*-- P0: 翻转容器 ref，拖拽时 direct DOM 操作 transform --*/
  const flipperElRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return subscribeToCheckpointEvents()
  }, [subscribeToCheckpointEvents])

  useEffect(() => {
    const idleWindow = window as IdleWindow
    const runWarmup = () => {
      void warmupEditorRuntime()
      warmDefaultShellCache()
      warmTerminalCreatePath()
    }

    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(runWarmup, { timeout: 2500 })
      return () => idleWindow.cancelIdleCallback?.(id)
    }

    const id = window.setTimeout(runWarmup, 1200)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <JanusChatProvider>
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-app)', color: 'var(--text)' }}>
      <Titlebar />
      <div
        className="flex-1 grid grid-rows-[1fr_28px] overflow-hidden"
        style={{
          gridTemplateColumns: `${sidebarCollapsed ? SIDE_PANEL_COLLAPSED_WIDTH : SIDE_PANEL_WIDTH} minmax(0, 1fr) ${
            officeRendered ? `${officeClosing ? '0px' : officeWidth === null ? OFFICE_PREVIEW_WIDTH : `${officeWidth}px`} ` : ''
          }${panelCollapsed ? SIDE_PANEL_COLLAPSED_WIDTH : SIDE_PANEL_WIDTH}`,
          transition: officeResizing
            ? 'none'
            : `grid-template-columns ${OFFICE_CLOSE_DURATION_MS}ms ${OFFICE_CLOSE_EASING}`,
        }}
      >
        <Sidebar />

        {/*-- 中心区域：3D 翻转容器（正面=终端，背面=蓝图） --*/}
        <main ref={centerWorkspaceRef} className="min-w-0 overflow-hidden relative" style={{ perspective: 1500, background: 'var(--bg-deep)' }}>
          <div
            ref={flipperElRef}
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              transformStyle: 'preserve-3d',
              /*-- P0: 拖拽时 transition: none（通过 store isIslandDragging 控制） --*/
              /*-- P2: 翻转动量感知 — 使用 flipDuration --*/
              transition: isIslandDragging
                ? 'none'
                : `transform ${flipDuration}ms cubic-bezier(0.25, 1, 0.25, 1)`,
              /*-- P0: 拖拽期间由 dragFlipProgress 实时计算旋转角度 --*/
              transform: (() => {
                const base = blueprintMode ? -180 : 0
                if (isIslandDragging) {
                  const dragRotation = dragFlipProgress * -15
                  return `rotateX(${base + dragRotation}deg)`
                }
                return `rotateX(${base}deg)`
              })(),
            }}
          >
            {/*-- 正面：终端视图 --*/}
            <div
              className="absolute inset-0 min-w-0"
              style={{
                backfaceVisibility: 'hidden',
                background: 'var(--bg-deep)',
              }}
            >
              {loadState === 'no-workspace' && <EmptyWorkspace />}
              {loadState === 'workspace-loaded' && <EmptyWorkspace />}
              {loadState === 'no-terminal' && <TerminalSelector />}
              {loadState === 'terminal-active' && <TerminalArea />}
            </div>

            {/*-- 背面：蓝图视图（P2 画布） --*/}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateX(180deg)',
                background: 'radial-gradient(circle at center, #111 0%, var(--bg-deep) 100%)',
              }}
            >
              <BlueprintFocusView />
            </div>
          </div>
        </main>

        {officeRendered && (
          <section
            ref={officeWorkspaceRef}
            className="relative min-w-0 overflow-hidden border-l border-white/[0.08]"
            aria-label="Office preview workspace"
            {...(officeClosing ? { inert: '' } : {})}
            style={{
              opacity: officeClosing ? 0 : 1,
              pointerEvents: officeClosing ? 'none' : 'auto',
              transition: `opacity ${OFFICE_CLOSE_DURATION_MS}ms ${OFFICE_CLOSE_EASING}`,
            }}
          >
            {!officeClosing && (
              <div
                role="separator"
                aria-label="Resize Office preview"
                aria-orientation="vertical"
                aria-valuemin={OFFICE_PREVIEW_MIN_WIDTH}
                aria-valuemax={Math.round(officeMaxWidth)}
                aria-valuenow={Math.round(officeMeasuredWidth)}
                tabIndex={0}
                className="absolute inset-y-0 left-0 z-20 w-2 cursor-col-resize touch-none outline-none hover:bg-[#ff7830]/20 focus-visible:bg-[#ff7830]/30"
                onPointerDown={handleOfficeResizeStart}
                onPointerMove={handleOfficeResizeMove}
                onPointerUp={handleOfficeResizeEnd}
                onPointerCancel={handleOfficeResizeEnd}
                onLostPointerCapture={handleOfficeResizeEnd}
                onKeyDown={handleOfficeResizeKeyDown}
              />
            )}
            <OfficePreviewPanel
              workspaceId={visibleOfficeWorkspaceId}
              onClose={handleCloseOffice}
            />
          </section>
        )}
        <Panel />
        <div className="col-span-full min-w-0 [&>footer]:h-full">
          <StatusBar />
        </div>
      </div>
      <FileEditor />
      <AgentNotificationHost />
    </div>
    </JanusChatProvider>
  )
}

function EmptyWorkspace() {
  const { addWorkspace, setActiveWorkspace } = useWorkspaceStore()
  const setLoadState = useAppStore((s) => s.setLoadState)

  const handleAdd = async () => {
    try {
      const workspace = await chooseAndCreateWorkspace()
      if (!workspace) return
      addWorkspace(workspace)
      setActiveWorkspace(workspace.id)
      setLoadState('no-terminal')
    } catch (err) {
      console.error('Failed to create workspace:', err)
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-5"
      style={{ background: 'var(--bg-deep)' }}
    >
      <div className="relative w-20 h-20 opacity-30">
        <div
          className="absolute w-[60px] h-[3px] rounded-sm top-1/2 left-1/2"
          style={{
            background: '#ffffff',
            transform: 'translate(-50%, -50%) rotate(45deg)',
          }}
        />
        <div
          className="absolute w-[60px] h-[3px] rounded-sm top-1/2 left-1/2"
          style={{
            background: '#ff7830',
            transform: 'translate(-50%, -50%) rotate(-45deg)',
          }}
        />
      </div>
      <div className="text-sm text-[#666]">开始使用 JanusX</div>
      <button
        onClick={handleAdd}
        className="px-5 py-2.5 rounded-md text-[13px] cursor-pointer transition-colors"
        style={{
          background: 'rgba(255, 120, 48, 0.12)',
          border: '1px solid rgba(255, 120, 48, 0.25)',
          color: '#ff7830',
        }}
      >
        选择工作区文件夹
      </button>
    </div>
  )
}
