import { useRef, useEffect, useCallback, useState, type DragEvent } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {
  formatTerminalFileReference,
  hasWorkspaceFileDrag,
  readWorkspaceFileDragData,
} from '@/lib/terminal-file-reference'
import {
  applyTerminalInputChunk,
  createTerminalInputTransactionState,
  normalizeTerminalInputPreviewText,
} from '@/lib/terminal-input-transaction'
import {
  extractRuntimeTelemetry,
  mergeRuntimeTelemetrySnapshot,
  type RuntimeTelemetrySnapshot,
  type RuntimeTelemetrySource,
} from '@/lib/runtime-telemetry'
import {
  clearTerminalGeometry,
  registerTerminalForceFit,
  reportTerminalGeometry,
  unregisterTerminalForceFit,
} from '@/lib/terminal-geometry'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'

interface CLITerminalProps {
  terminalId: string
  focused?: boolean
}

type TerminalDataPayload = {
  id: string
  data: string
  seq?: number
}

type TerminalReplayPayload = {
  data?: string
  seq?: number
}

const HISTORY_TELEMETRY_POLL_MS = 5_000

export function CLITerminal({ terminalId, focused = false }: CLITerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<(() => void) | null>(null)
  const focusedRef = useRef(focused)
  const [fileDragOver, setFileDragOver] = useState(false)
  const pendingOutputRef = useRef('')
  const telemetryFlushTimerRef = useRef<number | null>(null)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const panelCollapsed = useAppStore((s) => s.panelCollapsed)

  const applyTelemetryPatch = useCallback((
    telemetry: RuntimeTelemetrySnapshot,
    source: RuntimeTelemetrySource = 'live'
  ) => {
    const store = useWorkspaceStore.getState()
    const terminal = store.terminals.find((item) => item.id === terminalId)
    if (!terminal) return

    const patch = mergeRuntimeTelemetrySnapshot(terminal, telemetry, source)

    if (Object.keys(patch).length === 0) return
    store.updateTerminal(terminalId, patch)
  }, [terminalId])

  const updateTelemetry = useCallback((text: string) => {
    if (!text) return
    applyTelemetryPatch(extractRuntimeTelemetry(text))
  }, [applyTelemetryPatch])

  const scheduleOutputTelemetry = useCallback((data: string) => {
    pendingOutputRef.current += data
    if (telemetryFlushTimerRef.current !== null) return

    telemetryFlushTimerRef.current = window.setTimeout(() => {
      const pending = pendingOutputRef.current
      pendingOutputRef.current = ''
      telemetryFlushTimerRef.current = null
      updateTelemetry(pending)
    }, 800)
  }, [updateTelemetry])

  useEffect(() => {
    let cancelled = false

    const pollHistoryTelemetry = async () => {
      const terminal = useWorkspaceStore.getState().terminals.find((item) => item.id === terminalId)
      if (!terminal || terminal.preset === 'shell') return

      try {
        const result = await window.electron.invoke('runtime-telemetry:get', {
          preset: terminal.preset,
          cwd: terminal.cwd,
          startedAt: terminal.telemetryStartedAt,
        })
        if (cancelled || !result || typeof result !== 'object') return
        applyTelemetryPatch(result as RuntimeTelemetrySnapshot, 'history')
      } catch {
        // History telemetry is opportunistic; terminal rendering must not depend on it.
      }
    }

    void pollHistoryTelemetry()
    const timer = window.setInterval(() => {
      void pollHistoryTelemetry()
    }, HISTORY_TELEMETRY_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [terminalId, applyTelemetryPatch])

  useEffect(() => {
    focusedRef.current = focused
    if (focused) {
      // Refit after tab show so xterm geometry matches the visible pane without remount.
      const timers = [0, 50, 160, 320].map((delay) =>
        window.setTimeout(() => {
          fitRef.current?.()
          termRef.current?.focus()
        }, delay),
      )
      return () => timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [focused])

  // Side panel collapse/expand changes the center grid width; force a late refit
  // after the transition, matching the manual "toggle panel to recover" workaround.
  useEffect(() => {
    const timers = [80, 220, 480, 900].map((delay) =>
      window.setTimeout(() => {
        fitRef.current?.()
      }, delay),
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [sidebarCollapsed, panelCollapsed])

  useEffect(() => {
    if (!containerRef.current) return

    /*-- Windows 下传 windowsPty，让 xterm 按 ConPTY 模式处理行重排/光标语义，修正 IME 定位，对齐 VS Code --*/
    /*-- platform/windowsBuild 由 preload 同步暴露；非 Windows 传 undefined，零回归 --*/
    const windowsPty =
      window.electron.platform === 'win32'
        ? { backend: 'conpty' as const, buildNumber: window.electron.windowsBuild }
        : undefined

    /*-- 仅 Windows + conpty 时启用：xterm 行重排时把光标放到正确行，helper-textarea --*/
    /*-- （IME 候选栏锚点）随之贴住光标，修正候选栏定位。issue #274372，前提是 useConptyDll --*/
    const reflowCursorLine = windowsPty?.backend === 'conpty'

    const term = new Terminal({
      theme: {
        background: '#050505',
        foreground: '#d4d4d4',
        cursor: '#ff7830',
        cursorAccent: '#050505',
        selectionBackground: 'rgba(255, 120, 48, 0.18)',
        black: '#1f1f23',
        red: '#e06c75',
        green: '#4ec9b0',
        yellow: '#e5c07b',
        blue: '#58a6ff',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#888888',
        brightBlack: '#666666',
        brightRed: '#ff8585',
        brightGreen: '#00ff88',
        brightYellow: '#f0d28a',
        brightBlue: '#79b8ff',
        brightMagenta: '#d7a8d9',
        brightCyan: '#6ee7cf',
        brightWhite: '#f2f2f3',
      },
      fontFamily: '"SF Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 14,
      fontWeight: '400',
      fontWeightBold: '600',
      lineHeight: 1.4,
      letterSpacing: 0.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      scrollback: 5000,
      allowTransparency: true,
      windowsPty,
      reflowCursorLine,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    const hostElement = containerRef.current
    const hostParent = hostElement.parentElement

    // Scrollbar is optional for terminal operation; never skip fit/resize when missing.
    const scrollbarElement = hostElement.querySelector(
      '.xterm .xterm-scrollable-element > .scrollbar.vertical'
    )

    let draggingScrollbar = false

    const stopScrollbarDrag = () => {
      if (!draggingScrollbar) return
      draggingScrollbar = false
      document.body.classList.remove('terminal-scrollbar-dragging')
      window.removeEventListener('pointerup', stopScrollbarDrag)
      window.removeEventListener('blur', stopScrollbarDrag)
      window.removeEventListener('dragend', stopScrollbarDrag)
    }

    const handleScrollbarPointerDown = () => {
      draggingScrollbar = true
      document.body.classList.add('terminal-scrollbar-dragging')
      window.addEventListener('pointerup', stopScrollbarDrag)
      window.addEventListener('blur', stopScrollbarDrag)
      window.addEventListener('dragend', stopScrollbarDrag)
    }

    if (scrollbarElement instanceof HTMLElement) {
      scrollbarElement.addEventListener('pointerdown', handleScrollbarPointerDown, true)
    }

    let pendingSoftEnterCount = 0
    let win32InputMode = false
    let inputTransactionState = createTerminalInputTransactionState()

    const commitSubmittedInput = () => {
      const text = normalizeTerminalInputPreviewText(inputTransactionState.text)
      inputTransactionState = { ...inputTransactionState, text: '' }
      if (!text.trim()) return

      window.electron.send('terminal:submit-line', { id: terminalId, text })
      updateTelemetry(text)
    }

    const trackInputData = (data: string) => {
      const result = applyTerminalInputChunk(inputTransactionState, data, {
        softEnterCount: pendingSoftEnterCount,
      })
      inputTransactionState = result.state
      pendingSoftEnterCount = result.softEnterCount
      if (result.commitNow) {
        commitSubmittedInput()
      }
    }

    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type === 'keydown' && e.key === 'Enter' && (e.shiftKey || e.altKey)) {
        pendingSoftEnterCount += 1
        return true
      }

      if (e.type === 'keydown' && e.ctrlKey && e.key.toLowerCase() === 'j') {
        pendingSoftEnterCount += 1
        const terminal = useWorkspaceStore.getState().terminals.find((item) => item.id === terminalId)
        if (terminal?.preset === 'codex' && win32InputMode) {
          const data = '\x1b[74;36;10;1;8;1_'
          window.electron.send('terminal:input', { id: terminalId, data })
          trackInputData(data)
          e.preventDefault()
          return false
        }
        return true
      }

      const isCtrl = e.ctrlKey || e.metaKey
      if (!isCtrl) return true

      // Ctrl+C — 有选中内容时复制，否则放行（发送 \x03 中断信号）
      if (e.key === 'c') {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection())
          e.preventDefault()
          return false
        }
        return true
      }

      // Ctrl+V — 从剪贴板粘贴，统一走 onData 转发到 PTY 并追踪提交行
      if (e.key.toLowerCase() === 'v') {
        e.preventDefault()
        e.stopPropagation()
        if (e.type !== 'keydown') return false

        navigator.clipboard.readText().then((text) => {
          if (text) {
            term.paste(text)
          }
        }).catch(() => {})
        return false
      }

      // Ctrl+A — 全选
      if (e.key === 'a') {
        term.selectAll()
        return false
      }

      return true
    })

    let lastSyncedCols = 0
    let lastSyncedRows = 0
    let lastHostWidth = 0
    let lastHostHeight = 0
    let stableFitCount = 0
    let fitRaf = 0
    let layoutStable = false

    const fitAndSync = (options?: { force?: boolean; source?: string }) => {
      try {
        const host = containerRef.current
        // Avoid reporting a degenerate size before layout settles.
        if (!host || host.clientWidth < 80 || host.clientHeight < 60) return false

        const hostWidth = host.clientWidth
        const hostHeight = host.clientHeight
        const widthDelta = Math.abs(hostWidth - lastHostWidth)
        const heightDelta = Math.abs(hostHeight - lastHostHeight)
        const hostChanged = widthDelta > 1 || heightDelta > 1

        // During grid/panel transitions the first measured width is often wrong.
        // Prefer a stable size (or a forced late pass) before trusting the fit.
        if (!options?.force && !layoutStable && hostChanged) {
          lastHostWidth = hostWidth
          lastHostHeight = hostHeight
          stableFitCount = 0
          return false
        }

        if (!hostChanged) {
          stableFitCount += 1
        } else {
          lastHostWidth = hostWidth
          lastHostHeight = hostHeight
          stableFitCount = 1
        }

        if (!options?.force && !layoutStable && stableFitCount < 2) {
          return false
        }

        fitAddon.fit()
        if (focusedRef.current) {
          term.focus()
        }

        const cols = term.cols
        const rows = term.rows
        if (cols < 2 || rows < 1) return false

        // Always publish measured geometry so launch can spawn at the real pane size.
        reportTerminalGeometry(terminalId, cols, rows)

        const sizeChanged = cols !== lastSyncedCols || rows !== lastSyncedRows
        if (sizeChanged || options?.force) {
          lastSyncedCols = cols
          lastSyncedRows = rows
          window.electron.send('terminal:resize', {
            id: terminalId,
            cols,
            rows,
          })
        }

        if (!layoutStable && (options?.force || stableFitCount >= 2) && cols >= 40 && rows >= 10) {
          layoutStable = true
        }

        return sizeChanged
      } catch {
        // ignore fit errors during initial layout
        return false
      }
    }

    fitRef.current = () => {
      fitAndSync({ force: true, source: 'external' })
    }
    registerTerminalForceFit(terminalId, () => {
      fitAndSync({ force: true, source: 'launch' })
    })

    const scheduleFitFrame = () => {
      if (fitRaf) cancelAnimationFrame(fitRaf)
      fitRaf = requestAnimationFrame(() => {
        fitRaf = requestAnimationFrame(() => {
          fitRaf = 0
          fitAndSync({ source: 'raf' })
        })
      })
    }

    // Delayed passes cover panel/grid transitions that ResizeObserver can miss mid-animation.
    // Early force fits so first-open TUI can measure before terminal:create, not only on tab focus.
    const fitTimers: number[] = []
    const scheduleFit = (delayMs: number, force = false) => {
      const timer = window.setTimeout(() => {
        fitAndSync({ force, source: `timer:${delayMs}` })
      }, delayMs)
      fitTimers.push(timer)
    }

    // Immediate force fit on mount — do not wait for layoutStable when host already has size.
    fitAndSync({ force: true, source: 'mount' })
    scheduleFitFrame()
    scheduleFit(0, true)
    scheduleFit(50, true)
    scheduleFit(120, true)
    scheduleFit(240)
    scheduleFit(480)
    scheduleFit(900, true)
    scheduleFit(1600, true)

    const observer = new ResizeObserver(() => {
      scheduleFitFrame()
      // One post-transition catch-up after side panel collapse/expand finishes.
      scheduleFit(220)
      scheduleFit(420, true)
    })
    observer.observe(hostElement)
    if (hostParent) {
      // Observe the pane host too: grid column changes sometimes resize the parent first.
      observer.observe(hostParent)
    }

    const win32InputModeEnableDisposable = term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
      if (params.some((param) => param === 9001 || (Array.isArray(param) && param.includes(9001)))) {
        win32InputMode = true
        return true
      }
      return false
    })

    const win32InputModeDisableDisposable = term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
      if (params.some((param) => param === 9001 || (Array.isArray(param) && param.includes(9001)))) {
        win32InputMode = false
        return true
      }
      return false
    })

    let suppressReplayResponses = false

    term.onData((data) => {
      if (suppressReplayResponses) return
      window.electron.send('terminal:input', { id: terminalId, data })
      trackInputData(data)
    })

    // 输出 ← IPC
    let replayReady = false
    let replaySeq = 0
    let disposed = false
    const queuedLiveOutput: TerminalDataPayload[] = []

    const writeLiveOutput = (data: string) => {
      term.write(data)
      scheduleOutputTelemetry(data)
    }

    const flushQueuedLiveOutput = () => {
      for (const payload of queuedLiveOutput) {
        if (payload.seq !== undefined && payload.seq <= replaySeq) continue
        writeLiveOutput(payload.data)
        if (payload.seq !== undefined) {
          replaySeq = Math.max(replaySeq, payload.seq)
        }
      }
      queuedLiveOutput.length = 0
    }

    const unsubscribe = window.electron.on('terminal:data', (payload: unknown) => {
      const { id, data, seq } = payload as TerminalDataPayload
      if (id !== terminalId) return

      if (!replayReady) {
        queuedLiveOutput.push({ id, data, seq })
        return
      }
      if (seq !== undefined && seq <= replaySeq) return
      writeLiveOutput(data)
      if (seq !== undefined) {
        replaySeq = Math.max(replaySeq, seq)
      }
    })

    void window.electron.invoke('terminal:replay', { id: terminalId })
      .then((payload) => {
        if (disposed) return
        const replay = payload as TerminalReplayPayload
        const data = typeof replay.data === 'string' ? replay.data : ''
        replaySeq = typeof replay.seq === 'number' ? replay.seq : 0
        const finishReplay = () => {
          suppressReplayResponses = false
          replayReady = true
          flushQueuedLiveOutput()
          scheduleFitFrame()
          scheduleFit(120, true)
        }

        if (!data) {
          finishReplay()
          return
        }

        suppressReplayResponses = true
        term.write(data, finishReplay)
      })
      .catch(() => {
        if (disposed) return
        replayReady = true
        flushQueuedLiveOutput()
      })

    termRef.current = term

    return () => {
      disposed = true
      unregisterTerminalForceFit(terminalId)
      clearTerminalGeometry(terminalId)
      if (scrollbarElement instanceof HTMLElement) {
        scrollbarElement.removeEventListener('pointerdown', handleScrollbarPointerDown, true)
      }
      stopScrollbarDrag()
      observer.disconnect()
      if (fitRaf) cancelAnimationFrame(fitRaf)
      fitTimers.forEach((timer) => window.clearTimeout(timer))
      unsubscribe()
      if (telemetryFlushTimerRef.current !== null) {
        window.clearTimeout(telemetryFlushTimerRef.current)
        telemetryFlushTimerRef.current = null
      }
      win32InputModeEnableDisposable.dispose()
      win32InputModeDisableDisposable.dispose()
      term.dispose()
      termRef.current = null
      if (fitRef.current) fitRef.current = null
    }
  }, [terminalId, updateTelemetry, scheduleOutputTelemetry])

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasWorkspaceFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setFileDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFileDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const payload = readWorkspaceFileDragData(event.dataTransfer)
    if (!payload) return

    event.preventDefault()
    setFileDragOver(false)

    const reference = formatTerminalFileReference(payload.path)
    const term = termRef.current
    if (term) {
      term.focus()
      term.paste(reference)
      return
    }

    window.electron.send('terminal:input', { id: terminalId, data: reference })
  }, [terminalId, scheduleOutputTelemetry, updateTelemetry])

  return (
    <div
      ref={containerRef}
      className="w-full h-full transition-[box-shadow,background]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        boxShadow: fileDragOver ? 'inset 0 0 0 1px rgba(255, 120, 48, 0.45)' : 'none',
        background: fileDragOver ? 'rgba(255, 120, 48, 0.035)' : 'transparent',
      }}
    />
  )
}
