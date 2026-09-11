import { useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { groupByWorkspace, useRunningStore } from '@/stores/running'
import { projectService } from '@/services/project'

/**
 * useGlobalRunning — 全局运行轮询（Run-Orb 数据源，单例）
 *
 * 取代 useProjectRunning 的单工作区轮询：一次 `list()` 全量 + 按工作区分组，
 * 切工作区不再覆盖后台运行记录。挂载点见 Titlebar（Island 同级）。
 */
export function useGlobalRunning(pollMs = 3000) {
  const workspaces = useWorkspaceStore((s) => s.workspaces)

  useEffect(() => {
    let alive = true
    let inFlight = false
    const refs = workspaces.map((w) => ({ id: w.id, name: w.name, path: w.path }))

    const tick = async () => {
      if (!alive || inFlight) return
      inFlight = true
      try {
        const all = await projectService.list()
        if (!alive) return
        useRunningStore.getState().setFromGrouped(groupByWorkspace(all, refs))
      } catch (error) {
        if (alive) console.error('[run-orb] poll failed', error)
      } finally {
        inFlight = false
      }
    }

    // 后台页降频：hidden 时 10s，前台恢复立即 tick
    const effectiveMs = () => (document.hidden ? Math.max(pollMs, 10000) : pollMs)
    let timer: number | null = null
    const arm = () => {
      if (timer) window.clearInterval(timer)
      timer = window.setInterval(tick, effectiveMs())
    }
    const onVisibility = () => {
      arm()
      if (!document.hidden) void tick()
    }

    void tick()
    arm()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      alive = false
      if (timer) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pollMs, workspaces])
}
