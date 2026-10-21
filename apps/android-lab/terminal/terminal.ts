import { Terminal } from '@xterm/xterm'

// Note: .agents/notes/remote/android-pairing-handshake.md
// The phone mirrors the desktop PTY size. It never competes with desktop resize.
export class TerminalStream {
  private id = ''
  private seq = 0
  private fragment?: number
  private replaying = false
  private waiting = true
  private truncated = false
  constructor(private screen: {
    write(data: string, callback?: () => void): void
    resize(cols: number, rows: number): void
  }, private resync: () => void, private status: (text: string) => void) {}
  select(id: string): void {
    this.id = id; this.seq = 0; this.fragment = undefined; this.replaying = false; this.waiting = true
    this.screen.write('\x1bc')
  }
  private geometry(m: any): void {
    if (Number.isInteger(m.cols) && Number.isInteger(m.rows) && m.cols >= 2 && m.cols <= 1000 && m.rows >= 1 && m.rows <= 1000) this.screen.resize(m.cols, m.rows)
  }
  receive(m: any): void {
    if (!this.id || m.terminalId !== this.id) return
    if (m.type === 'replay-start') {
      this.waiting = false; this.replaying = true; this.fragment = undefined
      this.truncated = m.truncated === true
      this.geometry(m)
      this.screen.write('\x1bc')
      if (m.truncated) this.status('较早的历史输出已截断，正在恢复最近内容')
      return
    }
    if (m.type === 'replay-data' && this.replaying && typeof m.data === 'string') this.screen.write(m.data)
    if (m.type === 'replay-end' && this.replaying) {
      this.seq = m.seq; this.replaying = false
      this.screen.write('', () => this.status((m.alive === false ? '终端已退出 · 可查看历史输出' : '终端已同步') + (this.truncated ? ' · 较早历史已截断' : '')))
    }
    if (m.type !== 'output' || this.waiting || this.replaying || m.seq <= this.seq) return
    if (m.seq !== this.seq + 1 || (this.fragment !== undefined && this.fragment !== m.seq)) {
      this.waiting = true; this.status('输出出现缺口，正在重新同步'); this.resync(); return
    }
    this.geometry(m)
    if (typeof m.data === 'string') this.screen.write(m.data)
    this.fragment = m.final === false ? m.seq : undefined
    if (m.final !== false) this.seq = m.seq
  }
}

declare global {
  interface Window {
    AndroidTerminal: { ready(): void; resync(): void; status(text: string): void }
    mobileTerminal: { select(id: string): void; receive(m: unknown): void; font(delta: number): void; fit(): void; bottom(): void }
  }
}

if (typeof document !== 'undefined') {
  const host = document.getElementById('terminal')!
  const terminal = new Terminal({ cols: 80, rows: 30, fontSize: 12, fontFamily: 'monospace',
    scrollback: 10000, convertEol: false, disableStdin: true, cursorBlink: false,
    theme: { background: '#11151b', foreground: '#e2e8f0', cursor: '#e2e8f0' },
    allowProposedApi: false, scrollOnUserInput: false })
  terminal.open(host)
  let fitWidth = true
  const layout = () => {
    // xterm owns the screen dimensions; the outer viewport pans without clipping.
    const screen = host.querySelector<HTMLElement>('.xterm-screen')
    if (screen) {
      const width = parseFloat(screen.style.width), height = parseFloat(screen.style.height)
      if (!width || !height) return
      const viewport = document.getElementById('viewport')!
      const scale = fitWidth ? Math.min(1, (viewport.clientWidth - 16) / width) : 1
      host.style.width = `${width}px`; host.style.height = `${height}px`
      host.style.transform = `scale(${scale})`
      const surface = document.getElementById('surface')!
      surface.style.width = `${width * scale}px`; surface.style.height = `${height * scale}px`
    }
  }
  const stream = new TerminalStream({
    write: (data, callback) => terminal.write(data, callback),
    resize: (cols, rows) => { if (terminal.cols !== cols || terminal.rows !== rows) { terminal.resize(cols, rows); layout() } },
  }, () => window.AndroidTerminal.resync(), text => window.AndroidTerminal.status(text))
  let fontSize = 12
  window.mobileTerminal = {
    select: id => stream.select(id), receive: m => stream.receive(m),
    font: delta => { fitWidth = false; fontSize = Math.max(8, Math.min(24, fontSize + delta)); terminal.options.fontSize = fontSize; requestAnimationFrame(layout) },
    fit: () => { fitWidth = true; layout() },
    bottom: () => terminal.scrollToBottom(),
  }
  terminal.onRender(layout)
  window.addEventListener('resize', layout)
  requestAnimationFrame(() => { layout(); window.AndroidTerminal.ready() })
}
