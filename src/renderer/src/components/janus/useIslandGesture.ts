import { useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '@/stores/app'
import { isDoubleTapWithinTolerance, type TapPoint } from './islandInteraction'

/* ════════════════════════════════════════════════════════════
   useIslandGesture �?灵动岛手势识�?Hook
   设计原型：JanusX-Divine-System-Focus-Snap-Edition

   识别：长�?(Focus & Snap) / 下拉拖拽 (弹性阻�? / 双击
   ════════════════════════════════════════════════════════════ */

const SWIPE_THRESHOLD = 60          // 翻转阈�?px
const VELOCITY_THRESHOLD = 0.5      // 快甩阈�?px/ms
const LONG_PRESS_DURATION = 550     // 长按时长 ms（设计原型值）
const PRESS_DELAY = 100             // 按压延迟 ms

interface IslandGestureOptions {
  onLongPress: () => void           // 长按完成回调
  onSwipeFlip: () => void           // 下拉翻转回调
  onDoubleTap: () => void           // 双击回调
  /** 拖拽过程中实时回调，用于翻转容器预览旋转 */
  onSingleTap?: () => void
  onDragProgress?: (deltaY: number, progress: number) => void
  isRunning: boolean
  enableComplexGestures?: boolean
}

export function useIslandGesture({
  onLongPress,
  onSwipeFlip,
  onDoubleTap,
  onSingleTap,
  onDragProgress,
  isRunning,
  enableComplexGestures = true,
}: IslandGestureOptions) {
  const islandRef = useRef<HTMLDivElement>(null)
  const pullHintRef = useRef<HTMLDivElement>(null)
  /** 左眼元素 ref �?长按蓄力时向中间平移 */
  const eyeLeftRef = useRef<HTMLDivElement>(null)
  /** 右眼元素 ref �?长按蓄力时向中间平移 */
  const eyeRightRef = useRef<HTMLDivElement>(null)

  /*-- 内部状�?--*/
  const isPointerDown = useRef(false)
  const isDragging = useRef(false)
  const hasTriggeredLongPress = useRef(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const currentDragY = useRef(0)

  /*-- 定时�?--*/
  const pressDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFrame = useRef<number>(0)
  const pressStartTime = useRef(0)

  /*-- 动量感知 --*/
  const velocityHistory = useRef<Array<{ y: number; t: number }>>([])
  const flipRequestRef = useRef(0)
  const flipFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /*-- 双击检�?--*/
  const lastTapTime = useRef(0)
  const lastTapPoint = useRef<TapPoint | null>(null)
  const pendingSingleTapTimer = useRef<number | null>(null)
  const consumedPointerUp = useRef<number | null>(null)
  const DOUBLE_TAP_DELAY = 420
  const DOUBLE_TAP_TOLERANCE = 18

  /*-- 清理 --*/
  useEffect(() => {
    return () => {
      if (pressDelayTimer.current) clearTimeout(pressDelayTimer.current)
      if (flipFallbackTimerRef.current) clearTimeout(flipFallbackTimerRef.current)
      if (pendingSingleTapTimer.current) clearTimeout(pendingSingleTapTimer.current)
      cancelAnimationFrame(longPressFrame.current)
    }
  }, [])

  /*══════════════════════════════════════════════════════════�?
    长按蓄力 (Focus & Snap) �?无色物理压缩 + 双眼靠拢
    ════════════════════════════════════════════════════════════*/
  const startLongPressProgress = useCallback(() => {
    pressStartTime.current = Date.now()
    const island = islandRef.current
    const leftEye = eyeLeftRef.current
    const rightEye = eyeRightRef.current
    if (!island) return

    // 暂停 CSS 过渡，JS 逐帧接管
    island.style.transition = 'none'
    // 修复：直接添加到 island 元素上，匹配 CSS 选择�?.janus-island.is-charging
    island.classList.add('is-charging')

    function tick() {
      const progress = Math.min(
        (Date.now() - pressStartTime.current) / LONG_PRESS_DURATION,
        1,
      )

      // 物理压缩：横向缩窄、纵向压�?
      const scaleX = 1 - progress * 0.08
      const scaleY = 1 - progress * 0.12
      if (island) island.style.transform = `scale(${scaleX}, ${scaleY})`

      // 视线聚焦：双眼受压向中间靠拢（CSS gap 3px �?单边 1.5px 即重合）
      const eyeMove = progress * 1.5
      if (leftEye) leftEye.style.transform = `translateX(${eyeMove}px)`
      if (rightEye) rightEye.style.transform = `translateX(${-eyeMove}px)`

      if (progress >= 1) {
        hasTriggeredLongPress.current = true
        cancelLongPressProgress(true)

        // 触发 Snap 回弹动画 + 涟漪效果
        if (island) {
          island.classList.add('trigger-snap')
          setTimeout(() => {
            island.classList.remove('trigger-snap')
          }, 500)

          const ripple = island.previousElementSibling as HTMLElement | null
          if (ripple?.classList.contains('burst-ripple')) {
            ripple.classList.remove('burst')
            void ripple.offsetWidth  // 强制重绘
            ripple.classList.add('burst')
          }
        }

        onLongPress()
      } else {
        longPressFrame.current = requestAnimationFrame(tick)
      }
    }
    longPressFrame.current = requestAnimationFrame(tick)
  }, [onLongPress])

  const cancelLongPressProgress = useCallback((completed = false) => {
    cancelAnimationFrame(longPressFrame.current)
    const island = islandRef.current
    const leftEye = eyeLeftRef.current
    const rightEye = eyeRightRef.current

    if (island) island.style.transition = ''
    // 修复：从 island 元素移除 .is-charging �?
    island?.classList.remove('is-charging')

    // 清空 JS 注入的眼位移
    if (leftEye) leftEye.style.transform = ''
    if (rightEye) rightEye.style.transform = ''

    if (!completed && island) {
      island.style.transform = ''
    }
  }, [])

  /*══════════════════════════════════════════════════════════�?
    Pointer 事件处理
    ════════════════════════════════════════════════════════════*/
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return
      e.preventDefault()

      const now = Date.now()
      const point = { x: e.clientX, y: e.clientY }
      if (isDoubleTapWithinTolerance(
        lastTapTime.current,
        now,
        DOUBLE_TAP_DELAY,
        lastTapPoint.current,
        point,
        DOUBLE_TAP_TOLERANCE,
      )) {
        if (pendingSingleTapTimer.current) {
          clearTimeout(pendingSingleTapTimer.current)
          pendingSingleTapTimer.current = null
        }
        lastTapTime.current = 0
        lastTapPoint.current = null
        consumedPointerUp.current = e.pointerId
        onDoubleTap()
        return
      }

      e.currentTarget.setPointerCapture(e.pointerId)

      isPointerDown.current = true
      isDragging.current = false
      hasTriggeredLongPress.current = false
      startX.current = e.clientX
      startY.current = e.clientY
      currentDragY.current = 0
      velocityHistory.current = []

      if (!enableComplexGestures) return

      const island = islandRef.current
      if (island) {
        island.classList.add('pressing')
        island.style.transition = 'none'
      }

      // 启动长按延迟
      pressDelayTimer.current = setTimeout(() => {
        if (!isDragging.current) startLongPressProgress()
      }, PRESS_DELAY)

      // 拖拽取消长按
      flipRequestRef.current += 1
      if (flipFallbackTimerRef.current) {
        clearTimeout(flipFallbackTimerRef.current)
        flipFallbackTimerRef.current = null
      }
    },
    [enableComplexGestures, onDoubleTap, startLongPressProgress],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPointerDown.current || !enableComplexGestures) return
      const deltaY = e.clientY - startY.current

      // 拖拽判定：超�?5px 垂直位移
      if (
        !isDragging.current &&
        Math.abs(deltaY) > 5 &&
        Math.abs(deltaY) > Math.abs(e.clientX - startX.current)
      ) {
        isDragging.current = true
        if (pendingSingleTapTimer.current) clearTimeout(pendingSingleTapTimer.current)
        pendingSingleTapTimer.current = null
        lastTapTime.current = 0
        lastTapPoint.current = null
        if (pressDelayTimer.current) clearTimeout(pressDelayTimer.current)
        cancelLongPressProgress()
        const island = islandRef.current
        if (island) {
          island.classList.remove('pressing')
          island.classList.add('is-dragging')
          island.style.transform = 'translateY(0)'
        }
      }

      if (isDragging.current && deltaY > 0) {
        currentDragY.current = deltaY
        useAppStore.getState().setIsIslandDragging(true)

        // 动量记录（最�?5 帧）
        const now = performance.now()
        const history = velocityHistory.current
        history.push({ y: deltaY, t: now })
        if (history.length > 5) history.shift()

        // 弹性过阻尼
        const T = SWIPE_THRESHOLD
        const offset =
          deltaY < T ? deltaY * 0.4 : T * 0.4 + (deltaY - T) * 0.15

        const island = islandRef.current
        if (island) island.style.transform = `translateY(${offset}px)`

        // 拖拽进度 �?翻转容器实时旋转预览
        if (onDragProgress) {
          const progress = Math.min(deltaY / SWIPE_THRESHOLD, 1)
          onDragProgress(deltaY, progress)
        }

        // 下拉引导提示 �?跟随岛屿移动，避免遮�?
        const hint = pullHintRef.current
        if (hint) {
          if (deltaY > 20 && !isRunning) {
            hint.style.opacity = String(Math.min(deltaY / 30, 1))
            hint.style.transform = `translate(-50%, ${offset}px)` // 跟随岛屿向下移动
            if (deltaY >= T) {
              hint.textContent = 'Release to flip'
              hint.style.color = '#fff'
            } else {
              hint.textContent = 'Keep pulling to switch view'
              hint.style.color = '#888'
            }
          } else {
            hint.style.opacity = '0'
          }
        }
      }
    },
    [isRunning, enableComplexGestures, cancelLongPressProgress, onDragProgress],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (consumedPointerUp.current === e.pointerId) {
        consumedPointerUp.current = null
        return
      }
      if (!isPointerDown.current) return
      isPointerDown.current = false
      e.currentTarget.releasePointerCapture(e.pointerId)

      if (pressDelayTimer.current) clearTimeout(pressDelayTimer.current)
      if (!enableComplexGestures) {
        if (Math.hypot(e.clientX - startX.current, e.clientY - startY.current) <= 12) {
          lastTapTime.current = Date.now()
          lastTapPoint.current = { x: e.clientX, y: e.clientY }
        }
        return
      }

      const island = islandRef.current
      if (island) {
        island.classList.remove('pressing')
        island.classList.remove('is-dragging')
      }

      if (isDragging.current) {
        isDragging.current = false
        useAppStore.getState().setIsIslandDragging(false)
        // 重置拖拽翻转进度
        if (onDragProgress) onDragProgress(0, 0)

        // 隐藏提示
        const hint = pullHintRef.current
        if (hint) {
          hint.style.opacity = '0'
          hint.style.transform = 'translateX(-50%)' // 重置位置
        }

        // 计算释放速度
        const history = velocityHistory.current
        let velocity = 0
        if (history.length >= 2) {
          const first = history[0]
          const last = history[history.length - 1]
          const dt = last.t - first.t
          if (dt > 0) velocity = (last.y - first.y) / dt
        }
        useAppStore
          .getState()
          .setFlipDuration(velocity > VELOCITY_THRESHOLD ? 350 : 650)

        // 回弹动画
        if (island) {
          island.style.transition =
            'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          island.style.transform = 'translateY(0)'
        }

        // 达到翻转阈�?�?切换蓝图
        if (currentDragY.current >= SWIPE_THRESHOLD) {
          const requestId = ++flipRequestRef.current
          let flipApplied = false

          const applyFlipOnce = () => {
            if (flipApplied || requestId !== flipRequestRef.current) return
            flipApplied = true
            if (flipFallbackTimerRef.current) {
              clearTimeout(flipFallbackTimerRef.current)
              flipFallbackTimerRef.current = null
            }
            onSwipeFlip()
          }

          if (island) {
            const onEnd = (ev: TransitionEvent) => {
              if (ev.propertyName !== 'transform') return
              island.removeEventListener('transitionend', onEnd)
              applyFlipOnce()
            }
            island.addEventListener('transitionend', onEnd)
            flipFallbackTimerRef.current = setTimeout(applyFlipOnce, 450)
          } else {
            applyFlipOnce()
          }
        }

        currentDragY.current = 0
        velocityHistory.current = []
      } else {
        // 非拖�?�?检查双�?
        if (enableComplexGestures && !hasTriggeredLongPress.current && Math.hypot(e.clientX - startX.current, e.clientY - startY.current) <= 12) {
          cancelLongPressProgress()
          const now = Date.now()
          const tapPoint = { x: e.clientX, y: e.clientY }
          if (isDoubleTapWithinTolerance(
            lastTapTime.current,
            now,
            DOUBLE_TAP_DELAY,
            lastTapPoint.current,
            tapPoint,
            DOUBLE_TAP_TOLERANCE,
          )) {
            if (pendingSingleTapTimer.current) {
              clearTimeout(pendingSingleTapTimer.current)
              pendingSingleTapTimer.current = null
            }
            lastTapTime.current = 0
            lastTapPoint.current = null
            onDoubleTap()
          } else {
            lastTapTime.current = now
            lastTapPoint.current = tapPoint
            if (onSingleTap) {
              if (pendingSingleTapTimer.current) clearTimeout(pendingSingleTapTimer.current)
              pendingSingleTapTimer.current = window.setTimeout(() => {
                pendingSingleTapTimer.current = null
                lastTapTime.current = 0
                lastTapPoint.current = null
                onSingleTap()
              }, DOUBLE_TAP_DELAY)
            }
          }
        }
      }
    },
    [enableComplexGestures, onSwipeFlip, onDoubleTap, onSingleTap, cancelLongPressProgress, onDragProgress],
  )

  const handlePointerCancel = useCallback(() => {
    if (pendingSingleTapTimer.current) clearTimeout(pendingSingleTapTimer.current)
    pendingSingleTapTimer.current = null
    lastTapTime.current = 0
    lastTapPoint.current = null
    if (pressDelayTimer.current) clearTimeout(pressDelayTimer.current)
    if (flipFallbackTimerRef.current) {
      clearTimeout(flipFallbackTimerRef.current)
      flipFallbackTimerRef.current = null
    }
    isPointerDown.current = false
    consumedPointerUp.current = null
    isDragging.current = false
    cancelLongPressProgress()
    useAppStore.getState().setIsIslandDragging(false)
    if (onDragProgress) onDragProgress(0, 0)

    const island = islandRef.current
    if (island) {
      island.classList.remove('pressing')
      island.classList.remove('is-dragging')
      island.style.transform = ''
      island.style.transition = ''
    }

    const hint = pullHintRef.current
    if (hint) hint.style.opacity = '0'
    if (hint) hint.style.transform = 'translateX(-50%)' // 重置位置

    currentDragY.current = 0
    velocityHistory.current = []
  }, [cancelLongPressProgress, onDragProgress])

  return {
    islandRef,
    pullHintRef,
    eyeLeftRef,
    eyeRightRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  }
}
