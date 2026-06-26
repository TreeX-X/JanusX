import { useCallback, useEffect, useRef, useState } from 'react'

interface StreamingPrinterOptions {
  tickMs?: number
}

interface FinishWaiter {
  resolve: (value: string) => void
}

const DEFAULT_TICK_MS = 28

function nextBatchSize(bufferLength: number, finishing: boolean): number {
  if (finishing) {
    if (bufferLength > 240) return 48
    if (bufferLength > 80) return 24
    return 12
  }

  if (bufferLength > 600) return 32
  if (bufferLength > 240) return 18
  if (bufferLength > 80) return 10
  return 4
}

function nextDelay(text: string, pending: number, finishing: boolean, tickMs: number): number {
  if (finishing || pending > 120) return Math.max(8, Math.floor(tickMs / 2))
  if (/[。！？.!?]\s*$/.test(text)) return tickMs + 42
  if (/[，,；;：:]\s*$/.test(text)) return tickMs + 18
  return tickMs
}

export function useStreamingPrinter(options: StreamingPrinterOptions = {}) {
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS
  const [output, setOutput] = useState('')
  const [isPrinting, setIsPrinting] = useState(false)

  const outputRef = useRef('')
  const bufferRef = useRef('')
  const finishingRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const waiterRef = useRef<FinishWaiter | null>(null)
  const tickRef = useRef<() => void>(() => {})

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const resolveIfIdle = useCallback(() => {
    if (bufferRef.current.length > 0) return
    setIsPrinting(false)
    if (waiterRef.current) {
      const waiter = waiterRef.current
      waiterRef.current = null
      waiter.resolve(outputRef.current)
    }
  }, [])

  const schedule = useCallback((delay = tickMs) => {
    if (timerRef.current !== null) return
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      tickRef.current()
    }, delay)
  }, [tickMs])

  tickRef.current = () => {
    const buffer = bufferRef.current
    if (!buffer) {
      resolveIfIdle()
      return
    }

    const batchSize = Math.min(buffer.length, nextBatchSize(buffer.length, finishingRef.current))
    const batch = buffer.slice(0, batchSize)
    bufferRef.current = buffer.slice(batchSize)
    outputRef.current += batch
    setOutput(outputRef.current)
    setIsPrinting(true)

    schedule(nextDelay(batch, bufferRef.current.length, finishingRef.current, tickMs))
  }

  const reset = useCallback(() => {
    clearTimer()
    bufferRef.current = ''
    outputRef.current = ''
    finishingRef.current = false
    waiterRef.current = null
    setOutput('')
    setIsPrinting(false)
  }, [clearTimer])

  const append = useCallback((delta: string) => {
    if (!delta) return
    finishingRef.current = false
    bufferRef.current += delta
    setIsPrinting(true)
    schedule(0)
  }, [schedule])

  const complete = useCallback(() => {
    finishingRef.current = true
    if (!bufferRef.current) {
      setIsPrinting(false)
      return Promise.resolve(outputRef.current)
    }

    return new Promise<string>((resolve) => {
      waiterRef.current = { resolve }
      schedule(0)
    })
  }, [schedule])

  const flush = useCallback(() => {
    clearTimer()
    if (bufferRef.current) {
      outputRef.current += bufferRef.current
      bufferRef.current = ''
      setOutput(outputRef.current)
    }
    finishingRef.current = false
    setIsPrinting(false)
    const final = outputRef.current
    if (waiterRef.current) {
      const waiter = waiterRef.current
      waiterRef.current = null
      waiter.resolve(final)
    }
    return final
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  return {
    output,
    isPrinting,
    append,
    complete,
    flush,
    reset
  }
}
