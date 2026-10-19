import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { RightToolId } from '@/right-tools/types'

// Keep feedback local so quick reversals do not render intermediate panels.
const ACTIVATION_DELAY_MS = 100

export function usePendingToolActivation({
  activeToolId, validToolIds, onActivate, disabled = false, resetKey, toggleCurrent = false,
}: {
  activeToolId: RightToolId | null
  validToolIds: readonly RightToolId[]
  onActivate: (toolId: RightToolId) => void
  disabled?: boolean
  resetKey?: string
  toggleCurrent?: boolean
}) {
  const [pendingToolId, setPendingToolId] = useState<RightToolId | null>(null)
  const pendingRef = useRef<{ toolId: RightToolId; timer: number } | null>(null)
  const activateRef = useRef(onActivate)
  useLayoutEffect(() => { activateRef.current = onActivate }, [onActivate])

  const cancelPending = useCallback(() => {
    if (pendingRef.current) window.clearTimeout(pendingRef.current.timer)
    pendingRef.current = null
    setPendingToolId(null)
  }, [])

  useLayoutEffect(cancelPending, [activeToolId, disabled, resetKey, cancelPending])
  useLayoutEffect(() => {
    if (pendingRef.current && !validToolIds.includes(pendingRef.current.toolId)) cancelPending()
  }, [validToolIds, cancelPending])
  useLayoutEffect(() => () => {
    if (pendingRef.current) window.clearTimeout(pendingRef.current.timer)
  }, [])

  const requestActivate = (toolId: RightToolId) => {
    if (disabled || !validToolIds.includes(toolId) || pendingRef.current?.toolId === toolId) return
    const reversing = pendingRef.current !== null
    cancelPending()
    if (toolId === activeToolId) {
      // Reversing a pending switch keeps the panel open. A fresh rail click on
      // the active tool retains its existing collapse/expand behavior.
      if (toggleCurrent && !reversing) activateRef.current(toolId)
      return
    }
    setPendingToolId(toolId)
    const timer = window.setTimeout(() => {
      pendingRef.current = null
      setPendingToolId(null)
      activateRef.current(toolId)
    }, ACTIVATION_DELAY_MS)
    pendingRef.current = { toolId, timer }
  }

  return { pendingToolId, visualToolId: pendingToolId ?? activeToolId, requestActivate, cancelPending }
}
