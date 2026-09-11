import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'http'
import { WebTestGateway } from '../../src/main/web-test-gateway/server'
import { createElectronShim } from '../../src/main/web-test-gateway/shim'

function json(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return { method, path, body, headers }
}

async function request(
  port: number,
  route: { method: string; path: string; body?: unknown; headers?: Record<string, string> },
) {
  const res = await fetch(`http://127.0.0.1:${port}${route.path}`, {
    method: route.method,
    headers: { 'content-type': 'application/json', ...(route.headers ?? {}) },
    body: route.body === undefined ? undefined : JSON.stringify(route.body),
  })
  const text = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  return { status: res.status, contentType, body: contentType.includes('json') ? JSON.parse(text) : text }
}

describe('web-test-gateway', () => {
  let gateway: WebTestGateway | null = null

  afterEach(async () => {
    await gateway?.stop().catch(() => undefined)
    gateway = null
  })

  async function start(opts: { rendererDevUrl?: string } = {}) {
    const team = {
      register: vi.fn(async () => ({ token: 'access', refreshToken: 'refresh' })),
      login: vi.fn(async () => ({ token: 'access' })),
      logout: vi.fn(async () => ({ success: true })),
      refresh: vi.fn(async () => ({ token: 'access2' })),
      me: vi.fn(async () => ({ user: { id: 'u1' } })),
      listTenants: vi.fn(async () => []),
      createTenant: vi.fn(async () => ({ token: 'access' })),
      switchTenant: vi.fn(async () => ({ token: 'access' })),
      inviteMember: vi.fn(async () => ({ code: 'INV-1' })),
      acceptInvite: vi.fn(async () => ({ id: 't1' })),
      listMembers: vi.fn(async () => []),
      listProjects: vi.fn(async () => [{ id: 'p1' }]),
      setRole: vi.fn(async () => ({ success: true })),
      setMemberStatus: vi.fn(async () => ({ success: true })),
    }
    const remote = {
      issuePairingCode: vi.fn(async () => ({ code: 'CODE', expiresAt: 1 })),
      redeemPairingCode: vi.fn(async () => ({ hostDeviceId: 'h1', tenantId: 't1' })),
      listTerminals: vi.fn(async () => [{ terminalId: 'term1' }]),
      getTail: vi.fn(async () => ({ data: 'out', seq: 1 })),
      execute: vi.fn(async () => ({ ok: true, code: 'ok', message: 'ok' })),
      issueActionToken: vi.fn(async () => ({ token: 'at', expiresAt: 1 })),
      listTrustedDevices: vi.fn(async () => []),
      revokeDevice: vi.fn(async () => ({ success: true })),
      createTerminal: vi.fn(async () => ({ ok: true, code: 'ok', message: 'Terminal created', targetTerminalId: 't9' })),
      killTerminal: vi.fn(async () => ({ success: true, terminalId: 't9' })),
      resizeTerminal: vi.fn(async () => ({ success: true, terminalId: 't9', cols: 100, rows: 30 })),
    }
    const view = fakeView()
    const peer = {
      hostStatus: vi.fn(async () => ({ running: false })),
      startHost: vi.fn(async () => ({ running: true })),
      stopHost: vi.fn(async () => ({ success: true })),
      discover: vi.fn(async () => []),
      pair: vi.fn(async () => ({ hostDeviceId: 'h1', tenantId: 't1' })),
      listPeers: vi.fn(async () => []),
      listTerminals: vi.fn(async () => []),
      tail: vi.fn(async () => ({ data: '', seq: 0 })),
      execute: vi.fn(async () => ({ ok: true, code: 'ok', message: 'ok' })),
      disconnect: vi.fn(async () => ({ success: true })),
      forget: vi.fn(async () => ({ success: true })),
      viewWorkspaces: vi.fn(async () => [{ id: 'w1', name: 'demo', terminalCount: 1 }]),
      viewFiles: vi.fn(async () => []),
      viewTerminals: vi.fn(async () => []),
      createTerminal: vi.fn(async () => ({ ok: true, code: 'ok', message: 'Terminal created', targetTerminalId: 't9' })),
      killTerminal: vi.fn(async () => ({ success: true, terminalId: 't9' })),
      resizeTerminal: vi.fn(async () => ({ success: true, terminalId: 't9', cols: 100, rows: 30 })),
    }
    gateway = new WebTestGateway({ team, remote, view, peer, ...(opts.rendererDevUrl ? { rendererDevUrl: opts.rendererDevUrl } : {}) })
    const { port } = await gateway.start(0)
    return { port, team, remote, view, peer }
  }

  function fakeView() {
    return {
      listWorkspaceViews: vi.fn(async () => [{ id: 'w1', name: 'demo', terminalCount: 1 }]),
      listFileNodes: vi.fn(async () => [{ name: 'a.txt', relPath: 'a.txt', type: 'file' as const, hasChildren: false }]),
      listTerminalViews: vi.fn(async () => [{ terminalId: 't1', workspaceId: 'w1', status: 'running' as const, seq: 2 }]),
      getTerminalReplay: vi.fn(async () => ({ data: 'hello', seq: 1 })),
    }
  }

  it('根路径返回测试页，health 可达', async () => {
    const { port } = await start()
    const page = await request(port, json('GET', '/'))
    expect(page.status).toBe(200)
    expect(page.contentType).toContain('text/html')
    expect(String(page.body)).toContain('/api/team/login')
    const health = await request(port, json('GET', '/health'))
    expect(health.status).toBe(200)
    expect((health.body as { scope: string }).scope).toBe('loopback')
  })

  it('内联脚本可被浏览器解析（防模板转义回潮）', async () => {
    const { port } = await start()
    const res = await fetch(`http://127.0.0.1:${port}/`)
    const html = await res.text()
    const begin = html.indexOf('<script>') + '<script>'.length
    const end = html.indexOf('</scr' + 'ipt>')
    expect(begin).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(begin)
    const { Script } = await import('vm')
    expect(() => new Script(html.slice(begin, end))).not.toThrow()
  })

  it('团队注册透传设备身份，未带会话时 me 返回 401', async () => {
    const { port, team } = await start()
    const registered = await request(
      port,
      json('POST', '/api/team/register', {
        email: 'a@b.c',
        password: '12345678',
        device: { deviceId: 'd1', name: 'WebTest' },
      }),
    )
    expect(registered.status).toBe(200)
    expect(team.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.c', device: { deviceId: 'd1', name: 'WebTest' } }),
    )
    const me = await request(port, json('GET', '/api/team/me'))
    expect(me.status).toBe(401)
    expect((me.body as { code: string }).code).toBe('invalid-session')
  })

  it('远控回环透传 deviceId，缺设备时 400', async () => {
    const { port, remote } = await start()
    const headers = { authorization: 'Bearer access', 'x-janusx-device-id': 'd1' }
    const issued = await request(port, json('POST', '/api/remote/issue-code', undefined, headers))
    expect(issued.status).toBe(200)
    expect(remote.issuePairingCode).toHaveBeenCalledWith('access')
    const missing = await request(
      port,
      json('POST', '/api/remote/redeem', { code: 'CODE' }, { authorization: 'Bearer access' }),
    )
    expect(missing.status).toBe(400)
    const redeemed = await request(
      port,
      json('POST', '/api/remote/redeem', { code: 'CODE' }, headers),
    )
    expect(redeemed.status).toBe(200)
    expect(remote.redeemPairingCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CODE', clientDeviceId: 'd1', clientToken: 'access' }),
    )
    const terminals = await request(port, json('GET', '/api/remote/terminals', undefined, headers))
    expect(terminals.status).toBe(200)
    expect(remote.listTerminals).toHaveBeenCalledWith('access', 'd1')
  })

  it('三视图只读：工作区/文件树/终端状态同显示契约', async () => {
    const { port, view } = await start()
    const headers = { authorization: 'Bearer access' }
    const workspaces = await request(port, json('GET', '/api/view/workspaces', undefined, headers))
    expect(workspaces.status).toBe(200)
    expect(workspaces.body).toEqual([{ id: 'w1', name: 'demo', terminalCount: 1 }])
    const files = await request(
      port,
      json('GET', '/api/view/files?workspaceId=w1&dir=', undefined, headers),
    )
    expect(files.status).toBe(200)
    expect(view.listFileNodes).toHaveBeenCalledWith('w1', '')
    expect(files.body).toEqual([{ name: 'a.txt', relPath: 'a.txt', type: 'file', hasChildren: false }])
    const terminals = await request(port, json('GET', '/api/view/terminals', undefined, headers))
    expect(terminals.status).toBe(200)
    expect(terminals.body).toEqual([{ terminalId: 't1', workspaceId: 'w1', status: 'running', seq: 2 }])
    const anon = await request(port, json('GET', '/api/view/workspaces'))
    expect(anon.status).toBe(401)
  })

  it('SSE 实时流：首帧回放 + 增量推送，未配对拒绝建流', async () => {
    const { port, remote, view } = await start()
    // 未配对：getTail 抛 forbidden，建流失败且不挂起。
    remote.getTail = vi.fn(async () => {
      throw Object.assign(new Error('设备未配对'), { code: 'forbidden' })
    })
    const denied = await fetch(`http://127.0.0.1:${port}/api/view/stream?terminalId=t1&deviceId=d1&token=access`)
    expect(denied.status).toBe(403)
    await denied.text().catch(() => undefined)

    // 已配对：首帧回放，随后增量。
    remote.getTail = vi.fn(async () => ({ data: 'hello', seq: 1 }))
    let calls = 0
    view.getTerminalReplay = vi.fn(async () => {
      calls += 1
      return calls < 3 ? { data: 'hello', seq: 1 } : { data: 'hello world', seq: 2 }
    })
    const res = await fetch(`http://127.0.0.1:${port}/api/view/stream?terminalId=t1&deviceId=d1&token=access`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''
    const deadline = Date.now() + 5000
    while (!text.includes('"seq":2') && Date.now() < deadline) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    await reader.cancel().catch(() => undefined)
    expect(text).toContain('"chunk":"hello"')
    expect(text).toContain('"chunk":" world"')
  })

  it('团队管理补齐：项目/改角色/改状态透传', async () => {
    const { port, team } = await start()
    const headers = { authorization: 'Bearer access' }
    const projects = await request(port, json('GET', '/api/team/projects?tenantId=t1', undefined, headers))
    expect(projects.status).toBe(200)
    expect(team.listProjects).toHaveBeenCalledWith('access', 't1')
    const role = await request(
      port,
      json('POST', '/api/team/role', { tenantId: 't1', userId: 'u2', role: 'maintainer' }, headers),
    )
    expect(role.status).toBe(200)
    expect(team.setRole).toHaveBeenCalledWith('access', 't1', 'u2', 'maintainer')
    const status = await request(
      port,
      json('POST', '/api/team/member-status', { tenantId: 't1', userId: 'u2', status: 'disabled' }, headers),
    )
    expect(status.status).toBe(200)
    expect(team.setMemberStatus).toHaveBeenCalledWith('access', 't1', 'u2', 'disabled')
  })

  it('双机 peer 桥：发现/配对/执行透传', async () => {
    const { port, peer } = await start()
    const headers = { authorization: 'Bearer access' }
    const discovered = await request(port, json('GET', '/api/peer/discover?timeoutMs=500', undefined, headers))
    expect(discovered.status).toBe(200)
    expect(peer.discover).toHaveBeenCalledWith(500)
    const paired = await request(
      port,
      json('POST', '/api/peer/pair', { baseUrl: 'https://127.0.0.1:1', fingerprint: 'f'.repeat(64), code: 'C' }, headers),
    )
    expect(paired.status).toBe(200)
    expect(peer.pair).toHaveBeenCalledWith(expect.objectContaining({ token: 'access', code: 'C' }))
    const executed = await request(
      port,
      json('POST', '/api/peer/execute', { hostDeviceId: 'h1', command: { type: 'status' } }, headers),
    )
    expect(executed.status).toBe(200)
    expect(peer.execute).toHaveBeenCalledWith('access', 'h1', { type: 'status' }, undefined)
  })

  it('垫片：定义 window.electron，team 走网关信封', () => {
    const js = createElectronShim('win32')
    expect(js).toContain('window.electron')
    expect(js).toContain('/api/team/login')
    expect(js).toContain('/api/peer/pair')
    expect(js).toContain('/api/remote/redeem')
  })

  it('垫片端到端：shim 的 team.login 落到网关并包回信封', async () => {
    const { port, team } = await start()
    const res = await fetch(`http://127.0.0.1:${port}/__janusx/shim.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
    const js = await res.text()
    const { runInNewContext } = await import('vm')
    const sandbox: Record<string, unknown> = {
      window: {},
      fetch: (url: string, opts: RequestInit) => fetch(`http://127.0.0.1:${port}${url}`, opts),
    }
    runInNewContext(js, sandbox)
    const electron = (sandbox.window as { electron: { team: { login(input: unknown): Promise<unknown> } } }).electron
    expect(electron).toBeTruthy()
    const result = (await electron.team.login({ email: 'a@b.c', password: '12345678', device: { deviceId: 'd9', name: 't' } })) as {
      ok: boolean
      value: unknown
    }
    expect(result.ok).toBe(true)
    expect(team.login).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.c' }))
  })

  it('双机三视图透传：已配对被控的主界面骨架', async () => {
    const { port, peer } = await start()
    const headers = { authorization: 'Bearer access' }
    const workspaces = await request(port, json('GET', '/api/peer/view/workspaces?hostDeviceId=h1', undefined, headers))
    expect(workspaces.status).toBe(200)
    expect(peer.viewWorkspaces).toHaveBeenCalledWith('access', 'h1')
    const files = await request(
      port,
      json('GET', '/api/peer/view/files?hostDeviceId=h1&workspaceId=w1&dir=a', undefined, headers),
    )
    expect(files.status).toBe(200)
    expect(peer.viewFiles).toHaveBeenCalledWith('access', 'h1', 'w1', 'a')
    const terminals = await request(port, json('GET', '/api/peer/view/terminals?hostDeviceId=h1', undefined, headers))
    expect(terminals.status).toBe(200)
    expect(peer.viewTerminals).toHaveBeenCalledWith('access', 'h1')
  })

    it('建终端：回环/双机透传，非法引擎拒绝', async () => {
    const { port, remote, peer } = await start()
    const headers = { authorization: 'Bearer access', 'x-janusx-device-id': 'd1' }
    const created = await request(
      port,
      json('POST', '/api/remote/create-terminal', { workspaceId: 'w1', engine: 'codex' }, headers),
    )
    expect(created.status).toBe(200)
    expect(remote.createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ clientToken: 'access', clientDeviceId: 'd1', workspaceId: 'w1', engine: 'codex' }),
    )
    const badEngine = await request(
      port,
      json('POST', '/api/remote/create-terminal', { workspaceId: 'w1', engine: 'shell' }, headers),
    )
    expect(badEngine.status).toBe(400)
    const peerCreated = await request(
      port,
      json('POST', '/api/peer/create-terminal', { hostDeviceId: 'h1', workspaceId: 'w1', engine: 'claude' }, headers),
    )
    expect(peerCreated.status).toBe(200)
    expect(peer.createTerminal).toHaveBeenCalledWith('access', 'h1', 'w1', 'claude')
  })

  it('销毁终端：回环/双机透传，缺标识拒绝', async () => {
    const { port, remote, peer } = await start()
    const headers = { authorization: 'Bearer access', 'x-janusx-device-id': 'd1' }
    const killed = await request(
      port,
      json('POST', '/api/remote/kill-terminal', { terminalId: 't9' }, headers),
    )
    expect(killed.status).toBe(200)
    expect(remote.killTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ clientToken: 'access', clientDeviceId: 'd1', terminalId: 't9' }),
    )
    const missing = await request(
      port,
      json('POST', '/api/remote/kill-terminal', {}, headers),
    )
    expect(missing.status).toBe(400)
    const peerKilled = await request(
      port,
      json('POST', '/api/peer/kill-terminal', { hostDeviceId: 'h1', terminalId: 't9' }, headers),
    )
    expect(peerKilled.status).toBe(200)
    expect(peer.killTerminal).toHaveBeenCalledWith('access', 'h1', 't9')
  })

  it('同步尺寸：回环/双机透传，缺参拒绝', async () => {
    const { port, remote, peer } = await start()
    const headers = { authorization: 'Bearer access', 'x-janusx-device-id': 'd1' }
    const resized = await request(
      port,
      json('POST', '/api/remote/resize-terminal', { terminalId: 't9', cols: 187, rows: 55 }, headers),
    )
    expect(resized.status).toBe(200)
    expect(remote.resizeTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ clientToken: 'access', clientDeviceId: 'd1', terminalId: 't9', cols: 187, rows: 55 }),
    )
    const missing = await request(
      port,
      json('POST', '/api/remote/resize-terminal', { terminalId: 't9' }, headers),
    )
    expect(missing.status).toBe(400)
    const peerResized = await request(
      port,
      json('POST', '/api/peer/resize-terminal', { hostDeviceId: 'h1', terminalId: 't9', cols: 100, rows: 30 }, headers),
    )
    expect(peerResized.status).toBe(200)
    expect(peer.resizeTerminal).toHaveBeenCalledWith('access', 'h1', 't9', 100, 30)
  })

  it('xterm 静态资源：固定映射可达，无遍历面', async () => {
    const { port } = await start()
    const js = await fetch(`http://127.0.0.1:${port}/__janusx/xterm.js`)
    expect(js.status).toBe(200)
    expect(js.headers.get('content-type')).toContain('javascript')
    const css = await fetch(`http://127.0.0.1:${port}/__janusx/xterm.css`)
    expect(css.status).toBe(200)
    expect(css.headers.get('content-type')).toContain('css')
  })

  it('未知路径不泄漏网关文件：renderer 未启动时 502', async () => {
    const { port } = await start({ rendererDevUrl: 'http://127.0.0.1:1' })
    const missing = await fetch(`http://127.0.0.1:${port}/__janusx/../../secret`)
    expect(missing.status).toBe(502)
    const body = (await missing.json()) as { code: string }
    expect(body.code).toBe('renderer-unavailable')
  })

  it('/app 代理：入口注入垫片脚本，其余透传', async () => {    const vite = createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<html><head></head><body>app</body></html>')
        return
      }
      res.writeHead(200, { 'content-type': 'application/javascript' })
      res.end('console.log(1)')
    })
    await new Promise<void>((resolve) => vite.listen(0, '127.0.0.1', resolve))
    const address = vite.address()
    const vitePort = typeof address === 'object' && address ? address.port : 0
    const { WebTestGateway: Gateway } = await import('../../src/main/web-test-gateway/server')
    const gw2 = new Gateway({
      team: { register: async () => ({}) } as never,
      remote: {} as never,
      view: {} as never,
      peer: {} as never,
      rendererDevUrl: `http://127.0.0.1:${vitePort}`,
    })
    try {
      const { port: proxied } = await gw2.start(0)
      const entry = await (await fetch(`http://127.0.0.1:${proxied}/app/`)).text()
      expect(entry).toContain('<script src="/__janusx/shim.js"></script>')
      const asset = await (await fetch(`http://127.0.0.1:${proxied}/assets/x.js`)).text()
      expect(asset).toContain('console.log(1)')
    } finally {
      await gw2.stop().catch(() => undefined)
      await new Promise<void>((resolve) => vite.close(() => resolve()))
    }
  })
})
