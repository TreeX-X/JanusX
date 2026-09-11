import { describe, expect, it } from 'vitest'
import { Script, createContext, runInContext } from 'vm'
import { TEST_PAGE } from '../../src/main/web-test-gateway/page'

function makeEl() {
  const el: Record<string, unknown> = {
    style: {},
    children: [],
    textContent: '',
    innerHTML: '',
    value: '',
    className: '',
    title: '',
    disabled: false,
  }
  el.appendChild = (c: unknown) => { (el.children as unknown[]).push(c); return c }
  el.setAttribute = () => undefined
  el.querySelectorAll = () => []
  el.querySelector = () => null
  el.classList = { add: () => undefined, toggle: () => undefined, contains: () => false }
  return el
}

describe('page smoke', () => {
  it('顶层脚本在桩 DOM 下可运行且 showLogin 渲染', () => {
    const begin = TEST_PAGE.indexOf('<script>') + '<script>'.length
    const end = TEST_PAGE.indexOf('</scr' + 'ipt>')
    const code = TEST_PAGE.slice(begin, end)
    const els = new Map<string, Record<string, unknown>>()
    const byId = (id: string) => {
      if (!els.has(id)) els.set(id, makeEl())
      return els.get(id)
    }
    const store: Record<string, string> = {}
    const sandbox: Record<string, unknown> = {
      document: {
        getElementById: (id: string) => byId(id),
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => makeEl(),
        head: { appendChild: () => undefined },
      },
      window: { addEventListener: () => undefined },
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v },
      },
      navigator: { platform: 'test' },
      crypto: { randomUUID: () => 'uuid-1' },
      fetch: () => Promise.reject(new Error('no net in smoke')),
      console,
    }
    sandbox.EventSource = class {
      onmessage: unknown = null
      onerror: unknown = null
      url = ''
      constructor(url: string) { this.url = url }
      close(): void { undefined }
    }
    ;(sandbox as Record<string, unknown>).fetch = (url: string) => {
      const body = url.includes('/api/view/workspaces')
        ? [{ id: 'w1', name: 'demo', terminalCount: 1 }]
        : url.includes('/api/view/terminals')
          ? [{ terminalId: 't1', workspaceId: 'w1', status: 'running', seq: 1 }]
          : url.includes('kill-terminal')
            ? { success: true, terminalId: 't1' }
            : url.includes('/api/view/files')
              ? []
              : {}
      return Promise.resolve({ ok: true, json: async () => body })
    }
    createContext(sandbox)
    expect(() => new Script(code).runInContext(sandbox as never)).not.toThrow()
    const stage = byId('stage')
    expect(String(stage.innerHTML)).toContain('登录 JanusX')
    // 关键函数均已定义
    const fns = ['showTerminal', 'renderTerms', 'closeTabView', 'startLive', 'ensureXterm', 'ensureXtermCss', 'fitTerminal', 'doRefit', 'syncTermView', 'doCreateTerminal', 'stripAnsiForPre', 'onTermKey', 'reloadTerms', 'selectWs']
    for (const fn of fns) {
      expect(typeof (sandbox as Record<string, unknown>)[fn], fn).toBe('function')
    }
  })

  it('工作台全流程：进终端→渲染→销毁→切工作区无异常', async () => {
    const begin = TEST_PAGE.indexOf('<script>') + '<script>'.length
    const end = TEST_PAGE.indexOf('</scr' + 'ipt>')
    const code = TEST_PAGE.slice(begin, end)
    const els = new Map<string, Record<string, unknown>>()
    const byId = (id: string) => {
      if (!els.has(id)) els.set(id, makeEl())
      return els.get(id)
    }
    const store: Record<string, string> = {}
    const sandbox: Record<string, unknown> = {
      document: {
        getElementById: (id: string) => byId(id),
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => makeEl(),
        head: { appendChild: () => undefined },
      },
      window: { addEventListener: () => undefined },
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v },
      },
      navigator: { platform: 'test' },
      crypto: { randomUUID: () => 'uuid-1' },
      console,
    }
    sandbox.EventSource = class {
      onmessage: unknown = null
      onerror: unknown = null
      close(): void { undefined }
    }
    const killed = new Set<string>()
    ;(sandbox as Record<string, unknown>).fetch = (url: string, opts?: { body?: string }) => {
      if (url.includes('kill-terminal')) {
        try {
          const parsed = JSON.parse(String(opts?.body ?? '{}')) as { terminalId?: string }
          if (parsed.terminalId) killed.add(parsed.terminalId)
        } catch { /* 忽略 */
        }
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
      }
      const body = url.includes('/api/view/workspaces')
        ? [{ id: 'w1', name: 'demo', terminalCount: 1 }, { id: 'w2', name: 'demo2', terminalCount: 0 }]
        : url.includes('/api/view/terminals')
          ? [{ terminalId: 't1', workspaceId: 'w1', status: 'running', seq: 1 }].filter((t) => !killed.has(t.terminalId))
          : url.includes('/api/view/files')
            ? []
            : {}
      return Promise.resolve({ ok: true, json: async () => body })
    }
    createContext(sandbox)
    new Script(code).runInContext(sandbox as never)
    const run = (src: string) => new Script(src).runInContext(sandbox as never)
    const tick = (n = 20) => new Promise((r) => setTimeout(r, n))
    // 配对态 + 文本降级（跳过 xterm 加载）
    run(`S.paired = { kind: 'local' }; S.usePre = true; accessToken = 'tok';`)
    run(`showTerminal();`)
    await tick()
    await tick()
    // 中栏应渲染出 tab 与终端视图
    expect(String(byId('stage').innerHTML)).toContain('termList')
    run(`closeTabView('t1');`)
    await tick()
    await tick()
    // 切工作区：已删终端不得复活，且无异常
    run(`selectWs('w2');`)
    await tick()
    run(`selectWs('w1');`)
    await tick()
    await tick()
    const rest = run(`visibleTerms().length`) as number
    expect(rest).toBe(0)
  })
})
