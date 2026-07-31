export interface HoldToConfirmController {
  start: () => boolean
  cancel: () => void
  dispose: () => void
}

interface HoldToConfirmControllerOptions {
  durationMs: number
  onStart: () => void
  onCancel: () => void
  onConfirm: () => void
}

export function createHoldToConfirmController({
  durationMs,
  onStart,
  onCancel,
  onConfirm,
}: HoldToConfirmControllerOptions): HoldToConfirmController {
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    onCancel()
  }

  return {
    start: () => {
      if (timer !== null) return false
      onStart()
      timer = setTimeout(() => {
        timer = null
        onConfirm()
      }, durationMs)
      return true
    },
    cancel,
    dispose: () => {
      if (timer === null) return
      clearTimeout(timer)
      timer = null
    },
  }
}

export function isHoldConfirmKey(key: string): boolean {
  return key === 'Enter' || key === ' '
}
