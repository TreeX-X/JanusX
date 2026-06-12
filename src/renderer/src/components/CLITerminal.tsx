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
        selectionBackground: 'rgba(100, 140, 200, 0.25)',
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

    // 剪贴板快捷键拦截
    let skipNextInput = false

    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
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

      // Ctrl+V — 从剪贴板粘贴（term.paste 会触发 onData，用标志位跳过重复发送）
      if (e.key === 'v') {
        navigator.clipboard.readText().then((text) => {
          if (text) {
            skipNextInput = true
            term.paste(text)
          }
        })
        return false
      }

      // Ctrl+A — 全选
      if (e.key === 'a') {
        term.selectAll()
        return false
      }

      return true
    })

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
    let inputLine = ''
    let inEsc = false
    let inCSI = false

    term.onData((data) => {
      // 粘贴时 term.paste() 已将文本发送给 PTY，跳过重复转发
      const pasted = skipNextInput
      if (pasted) skipNextInput = false
      else window.electron.send('terminal:input', { id: terminalId, data })

      // Track user input for checkpoint system (无论是否粘贴都要追踪)
      for (const ch of data) {
        const code = ch.charCodeAt(0)

        // ESC — start of escape sequence
        if (code === 0x1b) {
          inEsc = true
          inCSI = false
          continue
        }

        // After ESC: '[' starts CSI, other byte ends the sequence
        if (inEsc && !inCSI) {
          if (code === 0x5b) {
            inCSI = true
          } else {
            inEsc = false
          }
          continue
        }

        // Inside CSI — skip until final letter
        if (inCSI) {
          if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
            inEsc = false
            inCSI = false
          }
          continue
        }

        // Enter — submit the line
        if (ch === '\r') {
          if (inputLine.length > 0) {
            window.electron.send('terminal:submit-line', { id: terminalId, text: inputLine })
          }
          inputLine = ''
          continue
        }

        // Backspace
        if (code === 0x7f || code === 0x08) {
          inputLine = inputLine.slice(0, -1)
          continue
        }

        // Regular character (including Chinese and all Unicode)
        if (code >= 0x20) {
          inputLine += ch
        }
      }
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
