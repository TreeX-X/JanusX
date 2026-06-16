import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'
import { JanusEye } from './JanusEye'
import { useIslandGesture } from './useIslandGesture'
import { projectService, type ProjectConfig } from '@/services/project'
import type { JanusMode } from './JanusEye'
import type { Workspace } from '@/types'

/* ════════════════════════════════════════════════════════════
   JanusIsland — Minimal pill-shaped island capsule
   Fixed 52x26px, contains only the eye pair — no label text.
   ════════════════════════════════════════════════════════════ */

const WORKSPACE_SWITCH_DURATION = 300

/**
 * useProjectRunning — 管理项目运行状态
 */
function useProjectRunning(activeWorkspace: Workspace | undefined) {
  const { janusRunning, setJanusRunning, setRunningProjects } = useAppStore()
  const [workspaceConfig, setWorkspaceConfig] = useState<ProjectConfig | null>(null)

  // 加载工作区配置和运行状态
  useEffect(() => {
    if (!activeWorkspace) {
      setWorkspaceConfig(null)
      setRunningProjects([])
      setJanusRunning(false)
      return
    }

    const loadData = async () => {
      try {
        const config = await projectService.readConfig(activeWorkspace.path)
        setWorkspaceConfig(config)

        const running = await projectService.listByWorkspace(activeWorkspace.path)
        setRunningProjects(running)
        setJanusRunning(running.length > 0)
      } catch (err) {
        console.error('Failed to load workspace data:', err)
      }
    }

    loadData()
    const interval = setInterval(loadData, 3000)
    return () => clearInterval(interval)
  }, [activeWorkspace, setJanusRunning, setRunningProjects])

  // 切换运行态
  const toggleRunning = useCallback(async () => {
    if (!activeWorkspace || !workspaceConfig) return

    try {
      if (janusRunning) {
        // 停止所有运行中的项目
        const running = await projectService.listByWorkspace(activeWorkspace.path)
        await Promise.all(running.map((p) => projectService.stop(p.id)))
        setJanusRunning(false)
        setRunningProjects([])
      } else {
        // 启动默认配置
        const defaultConfig =
          workspaceConfig.configurations.find((c) => c.name === 'dev') ||
          workspaceConfig.configurations[0]
        if (defaultConfig) {
          const success = await projectService.start(
            activeWorkspace.path,
            defaultConfig.name,
          )
          if (success) {
            const running = await projectService.listByWorkspace(activeWorkspace.path)
            setJanusRunning(running.length > 0)
            setRunningProjects(running)
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle project:', err)
    }
  }, [activeWorkspace, workspaceConfig, janusRunning, setJanusRunning, setRunningProjects])

  return { janusRunning, toggleRunning }
}

interface JanusIslandProps {
  onExpand: () => void
  onRunningChange?: (isRunning: boolean) => void
}

export function JanusIsland({ onExpand, onRunningChange }: JanusIslandProps) {
  const [switching, setSwitching] = useState(false)

  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastWorkspaceRef = useRef<{ id: string; name: string } | null>(null)
  const firstWorkspaceSeenRef = useRef(false)
  const eyeContainerRef = useRef<HTMLDivElement | null>(null)

  const blueprintMode = useAppStore((s) => s.blueprintMode)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  // 使用 useProjectRunning Hook 管理项目运行状态
  const { janusRunning, toggleRunning } = useProjectRunning(activeWorkspace)

  /*-- Janus mode calculation --*/
  const janusMode: JanusMode = !activeWorkspace
    ? 'sleep'
    : janusRunning
      ? 'running'
      : blueprintMode
        ? 'analytics'
        : 'order'

  const modeClass = `mode-${janusMode}`
  const eyeModeClass = janusRunning ? 'mode-running' : modeClass

  /*-- Long press: start/stop project --*/
  const handleLongPress = useCallback(async () => {
    await toggleRunning()
  }, [toggleRunning])

  /*-- Double tap: expand --*/
  const handleDoubleTap = useCallback(() => {
    onExpand()
  }, [onExpand])

  /*-- Swipe down: flip blueprint --*/
  const handleSwipeFlip = useCallback(() => {
    setBlueprintMode(!blueprintMode)
  }, [blueprintMode, setBlueprintMode])

  /*-- 拖拽进度 → 翻转容器实时旋转 --*/
  const handleDragProgress = useCallback(
    (_deltaY: number, progress: number) => {
      useAppStore.getState().setDragFlipProgress(progress)
    },
    [],
  )

  /*-- Gesture hook --*/
  const {
    islandRef,
    pullHintRef,
    eyeLeftRef,
    eyeRightRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useIslandGesture({
    onLongPress: handleLongPress,
    onSwipeFlip: handleSwipeFlip,
    onDoubleTap: handleDoubleTap,
    onDragProgress: handleDragProgress,
    isRunning: janusRunning,
  })

  /*-- Sync running state to parent + body class --*/
  useEffect(() => {
    onRunningChange?.(janusRunning)
    if (janusRunning) {
      document.body.classList.add('is-running')
    } else {
      document.body.classList.remove('is-running')
    }
    return () => {
      document.body.classList.remove('is-running')
    }
  }, [janusRunning, onRunningChange])

  /*-- Workspace switch animation --*/
  useEffect(() => {
    if (!activeWorkspaceId) {
      lastWorkspaceRef.current = null
      firstWorkspaceSeenRef.current = false
      return
    }
    if (!activeWorkspace) return

    const nextWorkspace = {
      id: activeWorkspaceId,
      name: activeWorkspace.name,
    }
    const previousWorkspace = lastWorkspaceRef.current
    lastWorkspaceRef.current = nextWorkspace

    if (!firstWorkspaceSeenRef.current) {
      firstWorkspaceSeenRef.current = true
      return
    }
    if (!previousWorkspace || previousWorkspace.id === nextWorkspace.id) return

    if (switchTimer.current) clearTimeout(switchTimer.current)

    setSwitching(true)

    // Brief eye opacity/scale transition on workspace change
    const eyeContainer = eyeContainerRef.current
    if (eyeContainer) {
      // Fast fade-out with ease-out
      eyeContainer.style.transition =
        'opacity 0.15s ease-out, transform 0.15s ease-out'
      eyeContainer.style.opacity = '0'
      eyeContainer.style.transform = 'scale(0.3)'

      // Delay 150ms then fade-in with ease-in
      setTimeout(() => {
        if (eyeContainer) {
          eyeContainer.style.transition =
            'opacity 0.15s ease-in, transform 0.15s ease-in'
          eyeContainer.style.opacity = '1'
          eyeContainer.style.transform = 'scale(1)'
        }
      }, 150)
    }

    switchTimer.current = setTimeout(() => {
      setSwitching(false)
      switchTimer.current = null
    }, WORKSPACE_SWITCH_DURATION)
  }, [activeWorkspaceId, activeWorkspace])

  /*-- Cleanup timers --*/
  useEffect(() => {
    return () => {
      if (switchTimer.current) clearTimeout(switchTimer.current)
    }
  }, [])

  /*-- Stub: keep startProgressAnimation for gesture hook compatibility --*/
  const startProgressAnimation = useCallback(() => {
    // No visual progress ring — the design uses pure physical compression
  }, [])

  return (
    <>
      {/* Pull-down hint */}
      <div
        ref={pullHintRef}
        className="pull-hint"
      />

      {/* Burst ripple for long-press feedback */}
      <div className="burst-ripple" />

      {/* Main pill island */}
      <div
        ref={islandRef}
        className={`janus-island ${eyeModeClass} ${switching ? 'switching' : ''}`}
        onPointerDown={(e) => {
          handlePointerDown(e)
          startProgressAnimation()
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div ref={(el) => {
          eyeContainerRef.current = el
        }} className={`janus-face-mini ${eyeModeClass}`}>
          <JanusEye
            mode={janusMode}
            size={10}
            leftRef={eyeLeftRef}
            rightRef={eyeRightRef}
          />
        </div>
      </div>
    </>
  )
}
