import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/app'
import { JanusEye } from './JanusEye'
import { useIslandGesture } from './useIslandGesture'
import { useJanusState } from './useJanusState'
import { projectService, type ProjectConfig } from '@/services/project'
import type { Workspace } from '@/types'

/* ════════════════════════════════════════════════════════════
   JanusIsland — 52×26px 折叠态胶囊
   状态由 useJanusState 统一管理，视觉由 data-mode 属性驱动
   ════════════════════════════════════════════════════════════ */

/** useProjectRunning — 管理项目运行状态 */
function useProjectRunning(activeWorkspace: Workspace | undefined) {
  const { janusRunning, setJanusRunning, setRunningProjects } = useAppStore()
  const [workspaceConfig, setWorkspaceConfig] = useState<ProjectConfig | null>(null)
  const configRef = useRef<ProjectConfig | null>(null)

  useEffect(() => {
    if (!activeWorkspace) {
      setWorkspaceConfig(null)
      setRunningProjects([])
      setJanusRunning(false)
      configRef.current = null
      return
    }

    const loadData = async () => {
      try {
        const config = await projectService.readConfig(activeWorkspace.path)
        setWorkspaceConfig(config)
        configRef.current = config
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

  useEffect(() => { configRef.current = workspaceConfig }, [workspaceConfig])

  const toggleRunning = useCallback(async () => {
    if (!activeWorkspace || !configRef.current) return
    try {
      if (janusRunning) {
        const running = await projectService.listByWorkspace(activeWorkspace.path)
        await Promise.all(running.map((p) => projectService.stop(p.id)))
        setJanusRunning(false)
        setRunningProjects([])
      } else {
        const cfg = configRef.current
        const defaultConfig =
          cfg.configurations.find((c) => c.name === 'dev') || cfg.configurations[0]
        if (defaultConfig) {
          const success = await projectService.start(activeWorkspace.path, defaultConfig.name)
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
  }, [activeWorkspace, janusRunning, setJanusRunning, setRunningProjects])

  return { janusRunning, toggleRunning }
}

interface JanusIslandProps {
  expanded?: boolean
  onExpand: () => void
  onRunningChange?: (isRunning: boolean) => void
}

export function JanusIsland({ expanded = false, onExpand, onRunningChange }: JanusIslandProps) {
  const { mode, isSwitching, activeWorkspace, eyeContainerRef } = useJanusState()
  const { janusRunning, toggleRunning } = useProjectRunning(activeWorkspace)

  const blueprintMode = useAppStore((s) => s.blueprintMode)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)

  const handleLongPress = useCallback(async () => {
    await toggleRunning()
  }, [toggleRunning])

  const handleDoubleTap = useCallback(() => { onExpand() }, [onExpand])

  const handleDoubleTapFeedback = useCallback(() => {
    const island = islandRef.current
    if (!island) return
    island.classList.add('double-tap-flash')
    window.setTimeout(() => {
      island.classList.remove('double-tap-flash')
    }, 180)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onExpand()
    }
  }, [onExpand])

  const handleSwipeFlip = useCallback(() => {
    setBlueprintMode(!blueprintMode)
  }, [blueprintMode, setBlueprintMode])

  const handleDragProgress = useCallback((_deltaY: number, progress: number) => {
    useAppStore.getState().setDragFlipProgress(progress)
  }, [])

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
    onDoubleTapFeedback: handleDoubleTapFeedback,
    onDragProgress: handleDragProgress,
    isRunning: janusRunning,
  })

  useEffect(() => {
    onRunningChange?.(janusRunning)
    document.body.classList.toggle('is-running', janusRunning)
    return () => { document.body.classList.remove('is-running') }
  }, [janusRunning, onRunningChange])

  return (
    <>
      <div ref={pullHintRef} className="pull-hint" />
      <div className="burst-ripple" />
      <div
        ref={islandRef}
        role="button"
        tabIndex={0}
        aria-label="展开 Janus 面板"
        aria-expanded={expanded}
        data-mode={mode}
        className={`janus-island${isSwitching ? ' switching' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
      >
        <div ref={(el) => { eyeContainerRef.current = el }} className="janus-face-mini">
          <JanusEye mode={mode} size={10} leftRef={eyeLeftRef} rightRef={eyeRightRef} />
        </div>
      </div>
    </>
  )
}
