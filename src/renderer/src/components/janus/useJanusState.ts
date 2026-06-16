import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'
import type { JanusMode } from './JanusEye'
import type { Workspace } from '@/types'

/* ════════════════════════════════════════════════════════════
   useJanusState — mode 推导 + 工作区切换动画
   单一数据源：所有 Janus 视觉状态从此导出
   ════════════════════════════════════════════════════════════ */

const WS_SWITCH_DURATION = 300

interface JanusState {
  mode: JanusMode
  isSwitching: boolean
  activeWorkspace: Workspace | undefined
  /** 眼睛容器 ref — 挂载后可执行切换渐隐动画 */
  eyeContainerRef: React.MutableRefObject<HTMLDivElement | null>
}

export function useJanusState(): JanusState {
  const [isSwitching, setIsSwitching] = useState(false)
  const eyeContainerRef = useRef<HTMLDivElement | null>(null)
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastWsIdRef = useRef<string | null>(null)
  const seenFirstRef = useRef(false)

  const blueprintMode = useAppStore((s) => s.blueprintMode)
  const janusRunning = useAppStore((s) => s.janusRunning)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  /*-- mode 推导 —优先级：运转 > 解析 > 秩序 > 休眠 --*/
  const mode: JanusMode = !activeWorkspace
    ? 'sleep'
    : janusRunning
      ? 'running'
      : blueprintMode
        ? 'analytics'
        : 'order'

  /*-- 工作区切换：眼睛渐隐再现 --*/
  useEffect(() => {
    if (!activeWorkspaceId) {
      lastWsIdRef.current = null
      seenFirstRef.current = false
      return
    }
    if (!seenFirstRef.current) {
      seenFirstRef.current = true
      lastWsIdRef.current = activeWorkspaceId
      return
    }
    if (lastWsIdRef.current === activeWorkspaceId) return
    lastWsIdRef.current = activeWorkspaceId

    if (switchTimerRef.current) clearTimeout(switchTimerRef.current)
    setIsSwitching(true)

    const el = eyeContainerRef.current
    if (el) {
      el.style.transition = 'opacity 0.15s ease-out, transform 0.15s ease-out'
      el.style.opacity = '0'
      el.style.transform = 'scale(0.3)'
      setTimeout(() => {
        const ref = eyeContainerRef.current
        if (!ref) return
        ref.style.transition = 'opacity 0.15s ease-in, transform 0.15s ease-in'
        ref.style.opacity = '1'
        ref.style.transform = 'scale(1)'
      }, 150)
    }

    switchTimerRef.current = setTimeout(() => {
      setIsSwitching(false)
      switchTimerRef.current = null
    }, WS_SWITCH_DURATION)
  }, [activeWorkspaceId])

  useEffect(() => {
    return () => {
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current)
    }
  }, [])

  return { mode, isSwitching, activeWorkspace, eyeContainerRef }
}
