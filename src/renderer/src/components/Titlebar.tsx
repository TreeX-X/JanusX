import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import appIcon from '@/assets/icons/app-icon.svg'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import type { LaunchConfig } from '@/types/project'

/*-- 灵动岛下拉翻转阈值（像素） --*/
const SWIPE_THRESHOLD = 50

/*-- 速度阈值：px/ms，超过视为快甩 --*/
const VELOCITY_THRESHOLD = 0.5

/*-- 长按触发时间（毫秒） --*/
const LONG_PRESS_DURATION = 800

export function Titlebar() {
  const [expanded, setExpanded] = useState(false)
  const [collapsing, setCollapsing] = useState(false)
  const [switching, setSwitching] = useState(false)
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressingRef = useRef(false)
  const [triggered, setTriggered] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggeredTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPressRef = useRef(false)
  const [workspaceConfig, setWorkspaceConfig] = useState<LaunchConfig | null>(null)
  const [runningProjects, setRunningProjects] = useState<any[]>([])
  const [pressProgress, setPressProgress] = useState(0)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressElRef = useRef<HTMLDivElement>(null)

  /*-- 下拉拖拽状态（全部通过 ref，pointermove 零 setState） --*/
  const blueprintMode = useAppStore((s) => s.blueprintMode)
  const toggleBlueprint = useAppStore((s) => s.toggleBlueprint)
  const startYRef = useRef(0)
  const isDraggingRef = useRef(false)
  const currentDragYRef = useRef(0)
  const islandElRef = useRef<HTMLDivElement>(null)
  const pullHintElRef = useRef<HTMLDivElement>(null)
  /*-- 标记是否有拖拽残留 inline style 需要清理 --*/
  const hasDragInlineRef = useRef(false)

  /*-- P2: 动量感知 — 记录最近 5 帧 {y, t} --*/
  const velocityHistory = useRef<Array<{ y: number; t: number }>>([])

  // 监听工作区切换 → 触发灵动岛过渡动画
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  // 获取当前工作区的启动配置和运行状态
  useEffect(() => {
    if (!activeWorkspace) {
      setWorkspaceConfig(null)
      setRunningProjects([])
      setIsRunning(false)
      return
    }

    const loadWorkspaceData = async () => {
      try {
        // 加载启动配置
        const configResult = await window.electron.invoke('project:config:read', activeWorkspace.path) as any
        if (configResult.success) {
          setWorkspaceConfig(configResult.data)
        } else {
          setWorkspaceConfig(null)
        }

        // 加载运行中的项目
        const listResult = await window.electron.invoke('project:list') as any
        if (listResult.success) {
          const filtered = listResult.data.filter((p: any) => p.id.startsWith(activeWorkspace.path))
          setRunningProjects(filtered)
          setIsRunning(filtered.length > 0)
        }
      } catch (err) {
        console.error('Failed to load workspace data:', err)
      }
    }

    loadWorkspaceData()

    // 定期刷新运行状态
    const interval = setInterval(loadWorkspaceData, 3000)
    return () => clearInterval(interval)
  }, [activeWorkspace])

  useEffect(() => {
    if (!activeWorkspaceId) return

    setSwitching(true)

    if (switchTimer.current) clearTimeout(switchTimer.current)
    switchTimer.current = setTimeout(() => {
      setSwitching(false)
      switchTimer.current = null
    }, 600)

    return () => {
      if (switchTimer.current) {
        clearTimeout(switchTimer.current)
        switchTimer.current = null
      }
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
      if (triggeredTimer.current) clearTimeout(triggeredTimer.current)
    }
  }, [])

  /*-- switching / isRunning / blueprintMode 变化时，仅清除拖拽残留 inline style --*/
  useEffect(() => {
    const el = islandElRef.current
    if (!el || isDraggingRef.current || !hasDragInlineRef.current) return
    hasDragInlineRef.current = false
    el.style.transform = ''
    el.style.transition = ''
    el.style.borderColor = ''
    el.style.boxShadow = ''
    el.style.border = ''
    const dot = el.querySelector('.island-dot') as HTMLElement | null
    if (dot) dot.style.boxShadow = ''
  }, [switching, isRunning, blueprintMode])

  const handleExpand = useCallback(() => {
    setCollapsing(false)
    setExpanded(true)
  }, [])

  const handleCollapse = useCallback(() => {
    setCollapsing(true)
  }, [])

  const handleCollapseEnd = useCallback(() => {
    setExpanded(false)
    setCollapsing(false)
  }, [])

  const handleIslandDblClick = useCallback((e: React.MouseEvent) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false
      return
    }
    e.stopPropagation()
    if (expanded) {
      handleCollapse()
    } else {
      handleExpand()
    }
  }, [expanded, handleExpand, handleCollapse])

  /*-- 清除进度动画 --*/
  const clearProgress = useCallback((fadeOut = false) => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
    const progressEl = progressElRef.current
    if (progressEl) {
      if (fadeOut) {
        progressEl.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out'
        progressEl.style.opacity = '0'
        progressEl.style.transform = 'scale(1.1)'
        setTimeout(() => setPressProgress(0), 300)
      } else {
        progressEl.style.transition = 'opacity 0.15s, transform 0.15s'
        progressEl.style.opacity = '0'
        progressEl.style.transform = 'scale(0.95)'
        setPressProgress(0)
      }
    } else {
      setPressProgress(0)
    }
  }, [])

  /*-- 指针按下：同时处理长按 + 下拉拖拽 --*/
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    isLongPressRef.current = false
    isDraggingRef.current = true
    startYRef.current = e.clientY
    currentDragYRef.current = 0
    velocityHistory.current = []
    pressingRef.current = true
    useAppStore.getState().setIsIslandDragging(true)

    const el = islandElRef.current
    if (el) {
      hasDragInlineRef.current = true
      /*-- 禁用 transition，确保跟手无延迟 --*/
      el.style.transition = 'none'
      /*-- 按压缩小：仅操作 transform（不改 width/height/borderRadius，避免覆盖 JSX） --*/
      el.style.transform = 'translateY(2px) scale(0.945, 0.857)'
      el.style.borderColor = 'rgba(255, 120, 48, 0.7)'
      el.style.boxShadow = '0 0 20px rgba(255, 120, 48, 0.35), inset 0 0 8px rgba(255, 120, 48, 0.1)'
    }

    /*-- 启动进度动画 --*/
    const progressEl = progressElRef.current
    if (progressEl) {
      progressEl.style.opacity = '1'
      progressEl.style.transform = 'scale(1)'
      progressEl.style.transition = 'opacity 0.15s, transform 0.15s'
    }

    const startTime = Date.now()
    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / LONG_PRESS_DURATION, 1)
      setPressProgress(progress)

      if (progress >= 1) {
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current)
          progressTimerRef.current = null
        }
      }
    }, 16)

    /*-- 长按计时器：仅在没有明显拖动时触发 --*/
    longPressTimer.current = setTimeout(async () => {
      if (currentDragYRef.current < 10) {
        isLongPressRef.current = true
        pressingRef.current = false
        /*-- 清理按压态 DOM 样式 --*/
        const el = islandElRef.current
        if (el) {
          el.style.borderColor = ''
          el.style.boxShadow = ''
          el.style.transform = 'translateY(0)'
        }

        /*-- 触发成功动画 + 光效淡出 --*/
        setTriggered(true)
        clearProgress(true)

        // 启动/停止当前工作区的项目
        if (activeWorkspace) {
          try {
            if (isRunning) {
              // 停止所有运行中的项目
              for (const project of runningProjects) {
                await window.electron.invoke('project:stop', project.id)
              }
              setIsRunning(false)
              setRunningProjects([])
            } else {
              // 启动默认配置（dev）
              if (workspaceConfig) {
                const defaultConfig = workspaceConfig.configurations.find(c => c.name === 'dev') || workspaceConfig.configurations[0]
                if (defaultConfig) {
                  const result = await window.electron.invoke('project:run', activeWorkspace.path, defaultConfig.name) as any
                  if (result.success) {
                    setIsRunning(true)
                    // 刷新运行状态
                    const listResult = await window.electron.invoke('project:list') as any
                    if (listResult.success) {
                      const filtered = listResult.data.filter((p: any) => p.id.startsWith(activeWorkspace.path))
                      setRunningProjects(filtered)
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error('Failed to toggle project:', err)
          }
        }

        triggeredTimer.current = setTimeout(() => {
          setTriggered(false)
          triggeredTimer.current = null
        }, 500)
      }
      longPressTimer.current = null
    }, LONG_PRESS_DURATION)
  }, [activeWorkspace, isRunning, runningProjects, workspaceConfig, clearProgress])

  /*-- 指针移动：下拉拖拽联动（全部 direct DOM，零 setState） --*/
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    const deltaY = e.clientY - startYRef.current

    /*-- 拖动超过 5px 取消长按判定 --*/
    if (Math.abs(deltaY) > 5 && longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      pressingRef.current = false
      clearProgress()
      /*-- 清除按压态（只清 transform + 视觉属性，不碰 width/height/borderRadius） --*/
      const el = islandElRef.current
      if (el) {
        el.style.borderColor = ''
        el.style.boxShadow = ''
        /*-- 清除 scale，后续 pointermove 只设 translateY --*/
        el.style.transform = 'translateY(0)'
      }
    }

    /*-- 仅允许下拉 --*/
    if (deltaY > 0) {
      currentDragYRef.current = deltaY

      /*-- P2: 记录速度帧（保留最近 5 帧） --*/
      const now = performance.now()
      const history = velocityHistory.current
      history.push({ y: deltaY, t: now })
      if (history.length > 5) history.shift()

      /*-- P2: 弹性过阻尼 — 超过阈值后阻尼系数递减（橡皮筋感） --*/
      const T = SWIPE_THRESHOLD
      const offset = deltaY < T ? deltaY * 0.4 : T * 0.4 + (deltaY - T) * 0.15

      /*-- P0: 直接操作灵动岛 DOM（不触发 re-render） --*/
      const el = islandElRef.current
      if (el) el.style.transform = `translateY(${offset}px)`

      /*-- P1: 阈值渐进视觉反馈 — 边框 + dot 直接 DOM 更新 --*/
      if (el) {
        hasDragInlineRef.current = true
        const progress = Math.min(deltaY / T, 1)
        /* 边框颜色：白色 → 橙色 */
        const r = Math.round(255 + (255 - 255) * progress)
        const g = Math.round(255 + (120 - 255) * progress)
        const b = Math.round(255 + (48 - 255) * progress)
        const a = (0.12 + progress * 0.68).toFixed(2)
        el.style.border = `1px solid rgba(${r},${g},${b},${a})`
        /* dot boxShadow 亮度递增 */
        const blur = 8 + progress * 6
        const glowA = (0.7 + progress * 0.3).toFixed(2)
        const dot = el.querySelector('.island-dot') as HTMLElement | null
        if (dot) dot.style.boxShadow = `0 0 ${blur}px rgba(255,120,48,${glowA})`
      }

      /*-- P1: 下拉引导提示（direct DOM 控制显隐） --*/
      const hint = pullHintElRef.current
      if (hint) {
        if (deltaY > 10 && !isRunning) {
          hint.style.opacity = String(Math.min(deltaY / 30, 1))
          if (deltaY >= T) {
            hint.textContent = '松开立即翻转'
            hint.style.color = '#ff7830'
          } else {
            hint.textContent = '↓ 继续下拉翻转视图'
            hint.style.color = '#666'
          }
        } else {
          hint.style.opacity = '0'
        }
      }
    }
  }, [isRunning])

  /*-- 指针释放：判断是否触发翻转 --*/
  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)

    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    pressingRef.current = false
    /*-- P0: 退出拖拽状态 --*/
    useAppStore.getState().setIsIslandDragging(false)

    /*-- 隐藏下拉提示 --*/
    const hint = pullHintElRef.current
    if (hint) {
      hint.style.opacity = '0'
      hint.style.color = '#666'
    }

    /*-- P2: 计算释放速度（动量感知） --*/
    const history = velocityHistory.current
    let velocity = 0
    if (history.length >= 2) {
      const first = history[0]
      const last = history[history.length - 1]
      const dt = last.t - first.t
      if (dt > 0) velocity = (last.y - first.y) / dt
    }
    /*-- P2: 快甩 350ms / 慢拖 650ms --*/
    const flipDuration = velocity > VELOCITY_THRESHOLD ? 350 : 650
    useAppStore.getState().setFlipDuration(flipDuration)

    const el = islandElRef.current

    /*-- 清理函数：动画结束后清除所有 inline style，让 JSX 重新接管 --*/
    const cleanupAfterTransition = () => {
      if (!el) return
      hasDragInlineRef.current = false
      el.style.transform = ''
      el.style.transition = ''
      el.style.borderColor = ''
      el.style.boxShadow = ''
      el.style.border = ''
      const dot = el.querySelector('.island-dot') as HTMLElement | null
      if (dot) dot.style.boxShadow = ''
      el.removeEventListener('transitionend', onTransitionEnd)
    }
    const onTransitionEnd = (ev: TransitionEvent) => {
      if (ev.propertyName === 'transform') cleanupAfterTransition()
    }

    /*-- 达到翻转阈值且不是长按 → 切换蓝图模式 --*/
    if (currentDragYRef.current >= SWIPE_THRESHOLD && !isLongPressRef.current) {
      /*-- 先回弹到原位，动画完成后再切换蓝图模式（避免视觉割裂） --*/
      if (el) {
        hasDragInlineRef.current = true
        el.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), border 0.3s ease, box-shadow 0.3s ease'
        el.style.transform = 'translateY(0)'
        el.style.borderColor = ''
        el.style.boxShadow = ''
        el.style.border = ''

        const onFlipTransitionEnd = (ev: TransitionEvent) => {
          if (ev.propertyName !== 'transform') return
          el.removeEventListener('transitionend', onFlipTransitionEnd)
          /*-- 清除 inline style → JSX 接管 → 切换蓝图模式 --*/
          hasDragInlineRef.current = false
          el.style.transform = ''
          el.style.transition = ''
          el.style.borderColor = ''
          el.style.boxShadow = ''
          el.style.border = ''
          const dot = el.querySelector('.island-dot') as HTMLElement | null
          if (dot) dot.style.boxShadow = ''
          /*-- 此时再切换蓝图模式，JSX 直接渲染蓝图样式，无割裂 --*/
          toggleBlueprint()
        }
        el.addEventListener('transitionend', onFlipTransitionEnd)
        /* 兜底 */
        setTimeout(() => {
          hasDragInlineRef.current = false
          el.style.transform = ''
          el.style.transition = ''
          el.style.borderColor = ''
          el.style.boxShadow = ''
          el.style.border = ''
          const dot = el.querySelector('.island-dot') as HTMLElement | null
          if (dot) dot.style.boxShadow = ''
          toggleBlueprint()
        }, 450)
      } else {
        toggleBlueprint()
      }

    } else {
      /*-- 未达阈值 → 弹簧回弹（overshoot cubic-bezier） --*/
      if (el) {
        hasDragInlineRef.current = true
        el.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), border 0.3s ease, box-shadow 0.3s ease'
        el.style.transform = 'translateY(0)'
        el.style.borderColor = ''
        el.style.boxShadow = ''
        el.style.border = ''
        el.addEventListener('transitionend', onTransitionEnd)
        setTimeout(cleanupAfterTransition, 450)
      }
    }

    /*-- 清除渐进视觉属性（dot） --*/
    const dot = el?.querySelector('.island-dot') as HTMLElement | null
    if (dot) dot.style.boxShadow = ''

    currentDragYRef.current = 0
    velocityHistory.current = []
  }, [toggleBlueprint])

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    isDraggingRef.current = false
    pressingRef.current = false
    clearProgress()
    useAppStore.getState().setIsIslandDragging(false)

    const el = islandElRef.current
    if (el) {
      /*-- 清除所有 inline style，让 JSX 重新接管 --*/
      hasDragInlineRef.current = false
      el.style.transform = ''
      el.style.transition = ''
      el.style.borderColor = ''
      el.style.boxShadow = ''
      el.style.border = ''
      const dot = el.querySelector('.island-dot') as HTMLElement | null
      if (dot) dot.style.boxShadow = ''
    }

    const hint = pullHintElRef.current
    if (hint) {
      hint.style.opacity = '0'
      hint.style.color = '#666'
    }

    currentDragYRef.current = 0
    velocityHistory.current = []
  }, [clearProgress])

  const portalVisible = expanded || collapsing

  // Expanded/collapsing island rendered via portal at body level
  const portalIsland = portalVisible && createPortal(
    <div
      className="fixed inset-0 titlebar-no-drag"
      style={{ zIndex: 99999 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          animation: collapsing
            ? 'backdrop-out 0.3s ease-in forwards'
            : 'backdrop-in 0.2s ease-out',
        }}
        onClick={handleCollapse}
      />

      {/* Centered island */}
      <div
        className="absolute left-1/2"
        style={{
          top: 38,
          transform: 'translateX(-50%)',
        }}
      >
        <div
          onDoubleClick={handleIslandDblClick}
          className="flex items-center justify-center cursor-pointer select-none"
          style={{
            width: collapsing ? 110 : 530,
            height: collapsing ? 28 : 205,
            borderRadius: collapsing ? 14 : 20,
            padding: collapsing ? '0 10px' : '14px 16px',
            background: '#000000',
            border: '1px solid rgba(255, 120, 48, 0.25)',
            flexDirection: collapsing ? 'row' : 'column',
            alignItems: collapsing ? 'center' : 'stretch',
            justifyContent: collapsing ? 'center' : 'space-between',
            boxShadow: collapsing
              ? '0 4px 12px rgba(0, 0, 0, 0.5)'
              : '0 16px 40px rgba(0, 0, 0, 0.95), 0 0 20px rgba(255, 120, 48, 0.08)',
            animation: collapsing
              ? 'island-collapse 0.3s cubic-bezier(0.55, 0, 1, 0.45) forwards'
              : 'island-expand 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            gap: collapsing ? 6 : 0,
          }}
          onAnimationEnd={collapsing ? handleCollapseEnd : undefined}
        >
          {/* Collapsing state: mini capsule content */}
          {collapsing && (
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: '#ff7830',
                  boxShadow: '0 0 8px rgba(255, 120, 48, 0.7)',
                }}
              />
              <span className="text-[11px] font-semibold text-[#a1a1aa] tracking-[0.2px]">
                SwitchX
              </span>
            </div>
          )}

          {/* Expanded state: full panel */}
          {!collapsing && (
            <div className="flex flex-col h-full justify-between">
              <div
                className="flex justify-between items-center pb-1.5"
                style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
              >
                <div className="text-[11px] font-bold uppercase tracking-[1px] text-[#ff7830] flex items-center gap-1.5">
                  <span>⚡</span> SwitchX
                </div>
                <div className="text-[9px] text-[#52525b]">双击收合</div>
              </div>

              <div className="flex-1 flex items-center justify-center text-[#333] text-xs">
                {/* 后续补充灵动岛功能 */}
              </div>

              <div
                className="flex justify-between items-center pt-1.5 text-[10px] text-[#71717a]"
                style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}
              >
                <span>Dynamic Island</span>
                <span className="text-[9px] text-[#52525b]">v0.1</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )

  return (
    <div
      className="h-[38px] flex items-center px-3.5 select-none titlebar-drag relative overflow-visible"
      style={{
        background: 'rgba(12, 12, 12, 0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        /*-- 确保灵动岛下拉时始终在 center area 之上 --*/
        zIndex: 9999,
      }}
    >
      <div className="flex gap-2 titlebar-no-drag">
        <div
          onClick={() => window.electron.invoke('window:close')}
          className="w-3 h-3 rounded-full bg-[#ff5f57] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] cursor-pointer hover:brightness-110 active:brightness-90"
        />
        <div
          onClick={() => window.electron.invoke('window:minimize')}
          className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] cursor-pointer hover:brightness-110 active:brightness-90"
        />
        <div
          onClick={() => window.electron.invoke('window:maximize')}
          className="w-3 h-3 rounded-full bg-[#28c840] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] cursor-pointer hover:brightness-110 active:brightness-90"
        />
      </div>

      {/* Logo */}
      <div className="absolute left-[70px] flex items-center gap-1.5 text-[13px] font-medium text-[#888] tracking-[0.3px] titlebar-no-drag">
        <img src={appIcon} alt="SwitchX" className="w-4 h-4" />
        <span>SwitchX</span>
      </div>

      {/* 灵动岛 — 折叠态内嵌在标题栏 */}
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2 titlebar-no-drag"
        style={{ zIndex: 2000 }}
      >
        {/*-- P1: 下拉引导提示（始终挂载，通过 direct DOM 控制显隐） --*/}
        <div
          ref={pullHintElRef}
          className="absolute left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap pointer-events-none"
          style={{
            top: 42,
            color: '#666',
            opacity: 0,
            transition: 'color 0.2s, opacity 0.2s',
          }}
        />
        {!expanded && !collapsing && (
          <div
            ref={islandElRef}
            onDoubleClick={handleIslandDblClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerCancel}
            onPointerCancel={handlePointerCancel}
            className="flex items-center justify-center select-none"
            style={{
              width: isRunning ? 126 : 110,
              height: isRunning ? 27 : 28,
              borderRadius: 14,
              padding: '0 12px',
              marginTop: 5,
              /*-- 统一 rgba 格式，确保浏览器可插值动画 --*/
              background: blueprintMode
                ? 'rgba(20, 8, 0, 0.9)'
                : 'rgba(0, 0, 0, 1)',
              border: blueprintMode
                ? '1px solid rgba(255, 120, 48, 1)'
                : isRunning
                  ? '1px solid rgba(16, 185, 129, 0.4)'
                  : switching
                    ? '1px solid rgba(255, 120, 48, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: blueprintMode
                ? '0 4px 15px rgba(255, 120, 48, 0.15)'
                : isRunning
                  ? '0 0 10px rgba(16, 185, 129, 0.2), inset 0 0 5px rgba(16, 185, 129, 0.1)'
                  : switching
                    ? '0 0 20px rgba(255, 120, 48, 0.4), 0 0 40px rgba(255, 120, 48, 0.15)'
                    : '0 4px 12px rgba(0, 0, 0, 0.5)',
              /*-- 显式列出可动画属性，排除 animation 等不可插值项 --*/
              transition: 'background 0.3s ease, border 0.3s ease, box-shadow 0.3s ease',
              animation: triggered
                ? 'trigger-flash 0.4s ease-out'
                : isRunning
                  ? 'compile-glow 1.5s infinite ease-in-out'
                  : switching
                    ? 'switching-pulse 0.6s ease-out'
                    : undefined,
              transform: 'translateY(0)',
              gap: 6,
              overflow: 'hidden',
              cursor: 'grab',
            }}
          >
            {/* 长按进度光效 */}
            <div
              ref={progressElRef}
              className="absolute inset-0 pointer-events-none"
              style={{
                opacity: 0,
                transform: 'scale(0.95)',
                transition: 'opacity 0.2s, transform 0.2s',
              }}
            >
              {/* 外层柔光 */}
              <div
                className="absolute -inset-2 rounded-[20px]"
                style={{
                  background: `conic-gradient(from 0deg, transparent ${100 - pressProgress * 100}%, rgba(255, 120, 48, 0.4) ${100 - pressProgress * 100 + 3}%, rgba(255, 180, 100, 0.6) ${100 - pressProgress * 100 + 8}%, rgba(255, 120, 48, 0.3) ${100 - pressProgress * 100 + 20}%, transparent ${100 - pressProgress * 100 + 25}%)`,
                  filter: 'blur(6px)',
                  transition: 'background 0.016s linear',
                }}
              />
              {/* 主进度条 */}
              <div
                className="absolute inset-0 rounded-[14px]"
                style={{
                  background: `conic-gradient(from 0deg, transparent ${100 - pressProgress * 100}%, rgba(255, 160, 80, 1) ${100 - pressProgress * 100 + 1}%, rgba(255, 200, 120, 1) ${100 - pressProgress * 100 + 3}%, rgba(255, 160, 80, 0.9) ${100 - pressProgress * 100 + 10}%, transparent ${100 - pressProgress * 100 + 15}%)`,
                  transition: 'background 0.016s linear',
                }}
              />
              {/* 流光点 */}
              {pressProgress > 0.02 && (
                <div
                  className="absolute"
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: 'rgba(255, 230, 180, 1)',
                    boxShadow: '0 0 6px 2px rgba(255, 200, 100, 0.9), 0 0 12px 4px rgba(255, 160, 60, 0.5)',
                    top: '50%',
                    left: '50%',
                    marginLeft: -2,
                    marginTop: -2,
                    transform: `rotate(${pressProgress * 360}deg) translateX(${isRunning ? 57 : 49}px)`,
                    transition: 'transform 0.016s linear',
                  }}
                />
              )}
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="island-dot w-2 h-2 rounded-full shrink-0"
                style={{
                  /*-- 统一 rgba 格式 --*/
                  background: blueprintMode
                    ? 'rgba(255, 120, 48, 1)'
                    : isRunning
                      ? 'rgba(16, 185, 129, 1)'
                      : 'rgba(255, 120, 48, 1)',
                  boxShadow: blueprintMode
                    ? '0 0 8px rgba(255, 120, 48, 0.7)'
                    : isRunning
                      ? '0 0 8px rgba(16, 185, 129, 0.7)'
                      : switching
                        ? '0 0 12px rgba(255, 120, 48, 0.9)'
                        : '0 0 8px rgba(255, 120, 48, 0.7)',
                  animation: switching ? 'switching-dot-pulse 0.6s ease-out' : 'pulse-breathing 1.5s ease-in-out infinite',
                  transition: 'background 0.3s ease, box-shadow 0.3s ease',
                }}
              />
              <span
                className="text-[11px] font-semibold tracking-[0.2px] whitespace-nowrap"
                style={{
                  /*-- 统一 rgba 格式 --*/
                  color: blueprintMode
                    ? 'rgba(255, 120, 48, 1)'
                    : isRunning
                      ? 'rgba(16, 185, 129, 1)'
                      : activeWorkspace
                        ? 'rgba(255, 120, 48, 1)'
                        : 'rgba(161, 161, 170, 1)',
                  transition: 'color 0.3s ease',
                }}
              >
                {blueprintMode
                  ? 'Blueprint'
                  : isRunning
                    ? 'Running'
                    : activeWorkspace
                      ? activeWorkspace.name
                      : 'SwitchX'}
              </span>
            </div>
          </div>
        )}
      </div>

      {portalIsland}
    </div>
  )
}
