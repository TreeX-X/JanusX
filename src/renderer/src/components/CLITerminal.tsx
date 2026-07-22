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
import { handleCodexMultilineInput } from '@/lib/codex-terminal-input'
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
import {
  createTerminalRecoveryScheduler,
  finalizeTerminalReplay,
  recoverTerminalViewportAndSync,
  type TerminalGeometrySize,
} from '@/lib/terminal-viewport-resize'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'
import type { TerminalDataEvent, TerminalReplayResult } from '../../../shared/ipc/terminal'

interface CLITerminalProps {
  terminalId: string
  visible?: boolean
  focused?: boolean
}

const HISTORY_TELEMETRY_POLL_MS = 5_000

export function CLITerminal({ terminalId, visible = true, focused = false }: CLITerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<(() => void) | null>(null)
  const focusedRef = useRef(focused)
  const visibleRef = useRef(visible)
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
        const result = await window.electron.system.getRuntimeTelemetry({
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
    visibleRef.current = visible
    if (visible) fitRef.current?.()
    if (focused) termRef.current?.focus()
  }, [focused, visible])

  // Side panel collapse/expand changes the center grid width; force a late refit
  // after the transition, matching the manual "toggle panel to recover" workaround.
  useEffect(() => {
    fitRef.current?.()
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
    let activeBufferType: 'normal' | 'alternate' = term.buffer.active.type

    const syncBufferType = (type: 'normal' | 'alternate') => {
      activeBufferType = type
      hostElement.dataset.bufferType = type
      if (type === 'normal') {
        const slider = hostElement.querySelector<HTMLElement>(
          '.xterm .xterm-scrollable-element > .scrollbar.vertical > .slider'
        )
        slider?.style.removeProperty('top')
      }
    }
    syncBufferType(term.buffer.active.type)
    const bufferChangeDisposable = term.buffer.onBufferChange((buffer) => {
      syncBufferType(buffer.type)
    })

    // Scrollbar is optional for terminal operation; never skip fit/resize when missing.
    const scrollbarElement = hostElement.querySelector(
      '.xterm .xterm-scrollable-element > .scrollbar.vertical'
    )
    const xtermElement = hostElement.querySelector<HTMLElement>('.xterm')
    const scrollbarSlider = scrollbarElement?.querySelector<HTMLElement>('.slider')

    let draggingScrollbar = false
    let lastScrollbarPointerY = 0
    let pendingAlternateDragDelta = 0

    const dispatchAlternateBufferWheel = (direction: -1 | 1) => {
      if (!xtermElement) return
      const rect = xtermElement.getBoundingClientRect()
      xtermElement.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        deltaY: direction * 100,
      }))
    }

    const handleAlternateScrollbarDrag = (event: PointerEvent) => {
      const delta = event.clientY - lastScrollbarPointerY
      lastScrollbarPointerY = event.clientY
      pendingAlternateDragDelta += delta

      if (scrollbarElement instanceof HTMLElement && scrollbarSlider) {
        const trackRect = scrollbarElement.getBoundingClientRect()
        const thumbHeight = scrollbarSlider.getBoundingClientRect().height
        const nextTop = Math.max(
          0,
          Math.min(trackRect.height - thumbHeight, event.clientY - trackRect.top - thumbHeight / 2)
        )
        scrollbarSlider.style.setProperty('top', `${nextTop}px`, 'important')
      }

      const steps = Math.min(8, Math.floor(Math.abs(pendingAlternateDragDelta) / 8))
      if (steps === 0) return
      const direction = pendingAlternateDragDelta < 0 ? -1 : 1
      for (let step = 0; step < steps; step += 1) {
        dispatchAlternateBufferWheel(direction)
      }
      pendingAlternateDragDelta -= direction * steps * 8
    }

    const stopScrollbarDrag = () => {
      if (!draggingScrollbar) return
      draggingScrollbar = false
      pendingAlternateDragDelta = 0
      document.body.classList.remove('terminal-scrollbar-dragging')
      window.removeEventListener('pointermove', handleAlternateScrollbarDrag)
      window.removeEventListener('pointerup', stopScrollbarDrag)
      window.removeEventListener('blur', stopScrollbarDrag)
      window.removeEventListener('dragend', stopScrollbarDrag)
    }

    const handleScrollbarPointerDown = (event: PointerEvent) => {
      draggingScrollbar = true
      document.body.classList.add('terminal-scrollbar-dragging')
      if (activeBufferType === 'alternate') {
        event.preventDefault()
        event.stopImmediatePropagation()
        term.focus()
        lastScrollbarPointerY = event.clientY
        pendingAlternateDragDelta = 0
        window.addEventListener('pointermove', handleAlternateScrollbarDrag)
      }
      window.addEventListener('pointerup', stopScrollbarDrag)
      window.addEventListener('blur', stopScrollbarDrag)
      window.addEventListener('dragend', stopScrollbarDrag)
    }

    if (scrollbarElement instanceof HTMLElement) {
      scrollbarElement.addEventListener('pointerdown', handleScrollbarPointerDown, true)
    }

    let pendingSoftEnterCount = 0
    let inputTransactionState = createTerminalInputTransactionState()

    const commitSubmittedInput = () => {
      const text = normalizeTerminalInputPreviewText(inputTransactionState.text)
      inputTransactionState = { ...inputTransactionState, text: '' }
      if (!text.trim()) return

      window.electron.terminal.submitLine(terminalId, text)
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
      const terminal = useWorkspaceStore.getState().terminals.find((item) => item.id === terminalId)
      const codexMultilineResult = handleCodexMultilineInput(
        terminal?.preset,
        e,
        (data) => window.electron.terminal.input(terminalId, data),
        (data) => {
          pendingSoftEnterCount += 1
          trackInputData(data)
        },
      )
      if (codexMultilineResult !== null) return codexMultilineResult

      if (e.type === 'keydown' && e.key === 'Enter' && (e.shiftKey || e.altKey)) {
        pendingSoftEnterCount += 1
        return true
      }

      if (e.type === 'keydown' && e.ctrlKey && e.key.toLowerCase() === 'j') {
        pendingSoftEnterCount += 1
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

    let lastSyncedGeometry: TerminalGeometrySize | null = null
    const fitAndSync = () => {
      try {
        const host = containerRef.current
        // Avoid reporting a degenerate size before layout settles.
        if (!host || host.clientWidth < 80 || host.clientHeight < 60) return false

        const fitResult = recoverTerminalViewportAndSync({
          visible: visibleRef.current,
          hostWidth: host.clientWidth,
          hostHeight: host.clientHeight,
          terminal: term,
          fit: () => fitAddon.fit(),
          refresh: (start, end) => term.refresh(start, end),
          previousGeometry: lastSyncedGeometry,
          reportGeometry: (cols, rows) => reportTerminalGeometry(terminalId, cols, rows),
          resizePty: (cols, rows) => window.electron.terminal.resize(terminalId, cols, rows),
        })
        if (focusedRef.current) {
          term.focus()
        }

        if (!fitResult.geometry) return false
        if (fitResult.sizeChanged) lastSyncedGeometry = fitResult.geometry

        return fitResult.sizeChanged
      } catch {
        // ignore fit errors during initial layout
        return false
      }
    }

    const recoveryScheduler = createTerminalRecoveryScheduler()
    const scheduleRecovery = () => recoveryScheduler.schedule(() => fitAndSync())
    fitRef.current = scheduleRecovery
    registerTerminalForceFit(terminalId, scheduleRecovery)

    // Immediate force fit on mount — do not wait for layoutStable when host already has size.
    // Early forced passes (0/16/50ms) so launch geometry wait can resolve before create.
    scheduleRecovery()

    const observer = new ResizeObserver(() => {
      scheduleRecovery()
    })
    observer.observe(hostElement)
    if (hostParent) {
      // Observe the pane host too: grid column changes sometimes resize the parent first.
      observer.observe(hostParent)
    }
    const handleWindowRecovery = () => {
      if (document.visibilityState === 'visible') scheduleRecovery()
    }
    window.addEventListener('focus', handleWindowRecovery)
    document.addEventListener('visibilitychange', handleWindowRecovery)

    let suppressReplayResponses = false

    term.onData((data) => {
      if (suppressReplayResponses) return
      window.electron.terminal.input(terminalId, data)
      trackInputData(data)
    })

    // 输出 ← IPC
    let replayReady = false
    let replaySeq = 0
    let disposed = false
    const queuedLiveOutput: TerminalDataEvent[] = []

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

    const unsubscribe = window.electron.terminal.onData(({ id, data, seq }) => {
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

    void window.electron.terminal.replay(terminalId)
      .then((payload) => {
        if (disposed) return
        const replay = payload as TerminalReplayResult
        const data = typeof replay.data === 'string' ? replay.data : ''
        replaySeq = typeof replay.seq === 'number' ? replay.seq : 0
        const finishReplay = () => {
          if (disposed) return
          finalizeTerminalReplay({
            releaseInput: () => { suppressReplayResponses = false },
            markReady: () => { replayReady = true },
            flushLiveOutput: flushQueuedLiveOutput,
            scheduleRecovery,
          })
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
        finalizeTerminalReplay({
          releaseInput: () => { suppressReplayResponses = false },
          markReady: () => { replayReady = true },
          flushLiveOutput: flushQueuedLiveOutput,
          scheduleRecovery,
        })
      })

    termRef.current = term

    return () => {
      disposed = true
      unregisterTerminalForceFit(terminalId)
      clearTerminalGeometry(terminalId)
      bufferChangeDisposable.dispose()
      delete hostElement.dataset.bufferType
      if (scrollbarElement instanceof HTMLElement) {
        scrollbarElement.removeEventListener('pointerdown', handleScrollbarPointerDown, true)
      }
      stopScrollbarDrag()
      observer.disconnect()
      window.removeEventListener('focus', handleWindowRecovery)
      document.removeEventListener('visibilitychange', handleWindowRecovery)
      recoveryScheduler.cancel()
      unsubscribe()
      if (telemetryFlushTimerRef.current !== null) {
        window.clearTimeout(telemetryFlushTimerRef.current)
        telemetryFlushTimerRef.current = null
      }
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

    window.electron.terminal.input(terminalId, reference)
  }, [terminalId, scheduleOutputTelemetry, updateTelemetry])

  return (
    <div
      ref={containerRef}
      className="cli-terminal w-full h-full transition-[box-shadow,background]"
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
