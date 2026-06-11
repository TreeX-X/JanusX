import { useRef, useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface CLITerminalProps {
  terminalId: string
}

export function CLITerminal({ terminalId }: CLITerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#121212',
        foreground: '#d4d4d4',
        cursor: '#ff7830',
        cursorAccent: '#121212',
        selectionBackground: 'rgba(255, 120, 48, 0.2)',
        black: '#27272a',
        red: '#dc2626',
        green: '#16a34a',
        yellow: '#ca8a04',
        blue: '#667eea',
        magenta: '#a855f7',
        cyan: '#0891b2',
        white: '#52525b',
        brightBlack: '#71717a',
        brightRed: '#ef4444',
        brightGreen: '#22c55e',
        brightYellow: '#eab308',
        brightBlue: '#8b9bff',
        brightMagenta: '#c084fc',
        brightCyan: '#06b6d4',
        brightWhite: '#18181b',
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
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    // 延迟 fit 确保 DOM 已渲染
    requestAnimationFrame(() => fitAddon.fit())

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        // 同步终端尺寸到 PTY
        window.electron.send('terminal:resize', {
          id: terminalId,
          cols: term.cols,
          rows: term.rows,
        })
      } catch {
        // ignore resize errors during dispose
      }
    })
    observer.observe(containerRef.current)

    // 输入 → IPC
    term.onData((data) => {
      window.electron.send('terminal:input', { id: terminalId, data })
    })

    // 输出 ← IPC
    const unsubscribe = window.electron.on('terminal:data', (payload: unknown) => {
      const { id, data } = payload as { id: string; data: string }
      if (id === terminalId) {
        term.write(data)
      }
    })

    termRef.current = term

    return () => {
      observer.disconnect()
      unsubscribe()
      term.dispose()
      termRef.current = null
    }
  }, [terminalId])

  return <div ref={containerRef} className="w-full h-full" />
}
