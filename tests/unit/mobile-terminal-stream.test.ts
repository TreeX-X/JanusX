import { describe, expect, it, vi } from 'vitest'
vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn() }))
import { TerminalStream } from '../../apps/android-lab/terminal/terminal'

function setup() {
  const writes: string[] = []
  const resize = vi.fn(), resync = vi.fn(), status = vi.fn()
  const stream = new TerminalStream({ write: (data, cb) => { writes.push(data); cb?.() }, resize }, resync, status)
  stream.select('t')
  const receive = (m: object) => stream.receive({ terminalId: 't', ...m })
  return { stream, receive, writes, resize, resync, status }
}

describe('Android terminal replay and live stream', () => {
  it('keeps split ANSI/Unicode output intact without adding line breaks or diagnostic text', () => {
    const { receive, writes, resize } = setup()
    receive({ type: 'replay-start', seq: 4, cols: 126, rows: 37 })
    receive({ type: 'replay-data', data: '\x1b[2J\x1b[' })
    receive({ type: 'replay-data', data: 'H中文😀' })
    receive({ type: 'replay-end', seq: 4 })
    receive({ type: 'output', seq: 5, final: false, data: '\r\x1b[2' })
    receive({ type: 'output', seq: 5, final: true, data: 'K完成' })
    receive({ type: 'output', seq: 5, final: true, data: 'duplicate' })
    expect(writes.join('')).toBe('\x1bc\x1bc\x1b[2J\x1b[H中文😀\r\x1b[2K完成')
    expect(resize).toHaveBeenCalledWith(126, 37)
  })
  it('requests one replay for a gap, drops incomplete output and resumes from the replay sequence', () => {
    const { receive, resync, writes } = setup()
    receive({ type: 'replay-start', seq: 8 })
    receive({ type: 'replay-end', seq: 8 })
    receive({ type: 'output', seq: 10, data: 'gap' })
    receive({ type: 'output', seq: 11, data: 'while recovering' })
    expect(resync).toHaveBeenCalledTimes(1)
    receive({ type: 'replay-start', seq: 11, truncated: true })
    receive({ type: 'replay-data', data: 'restored' })
    receive({ type: 'replay-end', seq: 11 })
    receive({ type: 'output', seq: 12, data: ' live', final: true })
    expect(writes.join('')).toContain('restored live')
    expect(writes.join('')).not.toContain('gap')
  })
  it('ignores the previous terminal while switching and waits for the new replay', () => {
    const { stream, receive, writes } = setup()
    stream.select('other')
    receive({ type: 'replay-start', seq: 99 })
    receive({ type: 'replay-data', data: 'old terminal' })
    stream.receive({ type: 'output', terminalId: 'other', seq: 1, data: 'too early' })
    expect(writes.join('')).not.toMatch(/old terminal|too early/)
  })
})
