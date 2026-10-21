import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { createServer as createTcpServer } from 'node:net'
import { createDesktopTestEnv, seedIntroducedLearning } from './desktop-test-env'
import { CPA_SURFACE_ID, type CpaAPI } from '../../src/shared/ipc/cpa'

const fixtureHtml = `<!doctype html><meta charset="utf-8"><title>CPA test management</title>
<main></main><script>
function render(){ document.querySelector('main').innerHTML=localStorage.getItem('loggedIn')
? '<h1>Account quota fixture</h1><p>5h quota: 70%</p><p>Reset count: 2</p><a href="/management.html#/quota">Quota</a><button id="popup">Open help</button>'
: '<label>Management key<input name="key" type="password"></label><button id="login">Login</button>';
document.querySelector('#login')?.addEventListener('click',()=>{localStorage.setItem('loggedIn','yes');render()});
document.querySelector('#popup')?.addEventListener('click',()=>window.open('/help','_blank')); }
render();</script>`

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture address')
  return `http://127.0.0.1:${address.port}`
}

async function boot(root: string, env: NodeJS.ProcessEnv = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: [resolve(process.env.JANUS_E2E_MAIN_ENTRY ?? 'out/main/index.js'), `--user-data-dir=${join(root, 'profile')}`], env: { ...createDesktopTestEnv(root), ...env } })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => (window as any).electron.system.setLanguage('en'))
  await seedIntroducedLearning(page)
  await page.reload()
  return { app, page }
}

async function openCpa(page: Page, url: string): Promise<void> {
  await page.evaluate(async (managementUrl) => {
    await ((window as any).electron.cpa as CpaAPI).saveSettings({ managementUrl })
  }, url)
  // The titlebar launcher works before any project, terminal or pane exists.
  await page.locator('button[data-id="tool-menu"]').click()
  await page.getByRole('menuitem', { name: 'CPA', exact: true }).click()
  await expect(page.locator('[data-cpa-view]')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function guest(app: ElectronApplication, origin: string): Promise<Page> {
  await expect.poll(() => app.context().pages().some((page) => page.url().startsWith(origin))).toBe(true)
  return app.context().pages().find((page) => page.url().startsWith(origin))!
}

async function nativeCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length)
}

async function closeCpa(page: Page): Promise<void> {
  const tab = page.locator('[data-tab-id*="janusx.cpa"]')
  await tab.locator('[data-tab-close]').hover()
  await page.mouse.down()
  try { await expect(tab).toHaveCount(0) }
  finally { await page.mouse.up() }
}

async function setCpaToggle(page: Page, name: string, checked: boolean): Promise<void> {
  const input = page.getByRole('checkbox', { name, exact: true })
  if (await input.isChecked() !== checked) await page.locator('label').filter({ has: input }).click()
  await expect(input).toBeChecked({ checked })
}

async function expectCompactCpa(app: ElectronApplication, page: Page, managed = false): Promise<void> {
  const view = page.locator('[data-cpa-view]')
  const toolbar = view.locator('[data-cpa-toolbar]')
  await expect(toolbar.getByRole('button')).toHaveCount(managed ? 3 : 2)
  await expect(toolbar).toHaveText('')
  await expect(toolbar.getByRole('button', { name: 'Open in browser', exact: true })).toBeVisible()
  const settings = toolbar.getByRole('button', { name: 'Connection settings', exact: true })
  await expect(settings).toBeVisible()
  await page.mouse.move(0, 0)
  await settings.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Connection settings')
  await page.mouse.move(0, 0)
  await expect(view.getByText('CPA account management', { exact: true })).toHaveCount(0)
  await expect(view.getByRole('tablist')).toHaveCount(0)
  await expect(view.getByRole('textbox')).toHaveCount(0)
  const box = await toolbar.boundingBox()
  expect(box).not.toBeNull()
  // Verify the actual native view starts directly under the sole host toolbar.
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
    const children = BrowserWindow.getAllWindows()[0].contentView.children
    return children.length === 1 ? children[0].getBounds().y : -1
  })).toBe(Math.round(box!.y + box!.height))
}

async function freePort(): Promise<number> {
  const server = createTcpServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

async function verifyManagedOAuth(app: ElectronApplication, page: Page, web: Page, origin: string, key: string, proxyTargets: string[]): Promise<void> {
  // Keep authorization outside the test: record the system-browser handoff without opening a provider.
  await app.evaluate(({ shell }) => {
    ;(globalThis as any).__cpaOAuthOpened = []
    shell.openExternal = async (url: string) => { (globalThis as any).__cpaOAuthOpened.push(url) }
  })
  await web.getByRole('link', { name: /^(OAuth Login|OAuth 登录)$/ }).click()
  await web.getByRole('button', { name: 'Codex', exact: true }).click()
  await expect(page.locator('[data-cpa-oauth-fallback]')).toContainText('1455')
  const callback = web.getByPlaceholder('http://localhost:1455/auth/callback?code=...&state=...').first()
  await expect(callback).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('oauth-manual-fallback.png') })
  await web.screenshot({ path: test.info().outputPath('oauth-original-callback-form.png') })
  const tabsBefore = await page.evaluate(() => (window as any).electron.browser.getState('integration:cpa').then((state: any) => state.tabs.length))
  await web.getByRole('button', { name: /^(Open Link|打开链接)$/i }).first().click()
  await expect.poll(() => app.evaluate(() => (globalThis as any).__cpaOAuthOpened.length)).toBe(1)
  const auth = await app.evaluate(() => {
    const url = (globalThis as any).__cpaOAuthOpened[0] as string
    return { url, state: new URL(url).searchParams.get('state')! }
  })
  // Rendering this server-generated link also verifies the redirected request kept management authentication.
  expect(new URL(auth.url).origin === 'https://auth.openai.com').toBe(true)
  expect(Boolean(auth.state)).toBe(true)
  expect(await page.evaluate(() => (window as any).electron.browser.getState('integration:cpa').then((state: any) => state.tabs.length))).toBe(tabsBefore)

  const wrongState = await fetch(`${origin}/v8/management/oauth/callback`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'codex', redirect_url: 'http://localhost:1455/auth/callback?error=access_denied&state=unknown-test-state' }),
  })
  expect(wrongState.status).toBe(404)
  await wrongState.body?.cancel()
  const wrongProvider = await fetch(`${origin}/v8/management/oauth/callback`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'claude', state: auth.state, error: 'access_denied' }),
  })
  expect(wrongProvider.status).toBe(400)
  await wrongProvider.body?.cancel()
  await callback.fill(`http://localhost:1455/auth/callback?error=access_denied&state=${encodeURIComponent(auth.state)}`)
  await web.getByRole('button', { name: /^(Submit Callback URL|提交回调 URL)$/i }).first().click()
  await expect.poll(async () => {
    const result = await fetch(`${origin}/v8/management/oauth/status?state=${encodeURIComponent(auth.state)}`, { headers: { Authorization: `Bearer ${key}` } })
    return (await result.json() as { status: string }).status
  }).toBe('error')
  await expect(page.locator('[data-cpa-oauth-fallback]')).toHaveCount(0)
  // A fresh pending flow remains cancellable through the unchanged backend contract.
  const cancelled = await web.evaluate(async ({ key }) => {
    const headers = { Authorization: `Bearer ${key}` }
    const result = await fetch('/v8/management/oauth/auth-url?provider=codex&is_webui=true', { headers })
    const auth = await result.json()
    const response = await fetch(`/v8/management/oauth/session?state=${encodeURIComponent(auth.state)}`, { method: 'DELETE', headers })
    return response.json()
  }, { key })
  expect(cancelled.cancelled).toBe(true)
  await expect(page.locator('[data-cpa-oauth-fallback]')).toHaveCount(0)
  // A synthetic code exercises the real backend's token transport. The local proxy rejects
  // CONNECT without opening an upstream socket, so no provider is contacted or token obtained.
  const proxyState = await web.evaluate(async ({ key }) => {
    const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
    const result = await fetch('/v8/management/oauth/auth-url?provider=codex&is_webui=true', { headers })
    const auth = await result.json()
    const submitted = await fetch('/v8/management/oauth/callback', {
      method: 'POST', headers, body: JSON.stringify({ provider: 'codex', state: auth.state, code: 'janusx-proxy-test-code' }),
    })
    if (!submitted.ok) throw new Error('Fixture callback rejected')
    return auth.state as string
  }, { key })
  try { await expect.poll(() => proxyTargets.includes('auth.openai.com:443')).toBe(true) } catch {
    const response = await fetch(`${origin}/v8/management/oauth/status?state=${encodeURIComponent(proxyState)}`, { headers: { Authorization: `Bearer ${key}` } })
    throw new Error(`Fixture token transport: ${JSON.stringify(await response.json())}; proxy targets: ${JSON.stringify(proxyTargets)}`)
  }
  await expect.poll(async () => {
    const result = await fetch(`${origin}/v8/management/oauth/status?state=${encodeURIComponent(proxyState)}`, { headers: { Authorization: `Bearer ${key}` } })
    return (await result.json() as { status: string }).status
  }).toBe('error')
  // Observe status through the guest, just as the original page does.
  await web.evaluate(async ({ key, state }) => {
    await fetch(`/v8/management/oauth/status?state=${state}`, { headers: { Authorization: `Bearer ${key}` } })
  }, { key, state: proxyState })
  await expect(page.locator('[data-cpa-oauth-fallback]')).toHaveCount(0)

  // Windows CPA uses the system certificate store. Keep TLS verification intact:
  // use an isolated synthetic credential and HTTP target for full response assertions,
  // and separately verify HTTPS CONNECT below. No real account or upstream is contacted.
  const credential = await web.evaluate(async ({ key }) => {
    const data = new FormData()
    data.append('file', new Blob([JSON.stringify({ type: 'codex', email: 'cpa-fixture@example.test',
      access_token: 'fixture-access', refresh_token: 'fixture-refresh', account_id: 'fixture-account', expired: '2099-01-01T00:00:00Z',
    })], { type: 'application/json' }), 'codex-fixture.json')
    const uploaded = await fetch('/v8/management/credentials', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: data })
    if (!uploaded.ok) throw new Error(`Fixture credential upload: ${uploaded.status}`)
    const response = await fetch('/v8/management/credentials', { headers: { Authorization: `Bearer ${key}` } })
    const { files } = await response.json()
    const file = files.find((file: any) => file.provider === 'codex' || file.type === 'codex')
    return { authIndex: file?.auth_index as string | undefined, name: file?.name as string | undefined }
  }, { key })
  const { authIndex } = credential
  expect(authIndex).toBeTruthy()
  // The exact management channel used by quota, subscriptions and reset credits must proxy too.
  for (const path of ['/wham/usage', '/subscriptions', '/wham/rate-limit-reset-credits', '/wham/rate-limit-reset-credits/consume']) {
    const response = await web.evaluate(async ({ key, path, authIndex }) => {
      const result = await fetch('/v8/management/requests/api-call', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ authIndex, method: path.endsWith('/consume') ? 'POST' : 'GET', url: `http://quota-fixture.invalid/backend-api${path}`,
          header: { Authorization: 'Bearer $TOKEN$' } }),
      })
      return { status: result.status, result: await result.json() }
    }, { key, path, authIndex })
    expect(response.status).toBe(200)
    expect(response.result.status_code).toBe(200)
    expect(JSON.parse(response.result.body).fixturePath).toBe(`/backend-api${path}`)
  }
  const https = await web.evaluate(async ({ key }) => {
    const response = await fetch('/v8/management/requests/api-call', { method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'GET', url: 'https://chatgpt.com/backend-api/wham/usage' }),
    })
    return response.status
  }, { key })
  expect(https).toBe(502)
  expect(proxyTargets).toContain('chatgpt.com:443')
}

async function cleanup(app: ElectronApplication | undefined, server: Server, root: string) {
  if (app) await app.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

test('CPA settings use themed controls, switch modes and retain a usable footer at narrow widths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'janusx-cpa-settings-'))
  let app: ElectronApplication | undefined
  try {
    const booted = await boot(root); app = booted.app
    const { page } = booted
    await page.getByTitle('Settings', { exact: true }).click()
    await page.locator('[data-tab="integrations"]').click()
    const panel = page.locator('[data-cpa-settings]')
    const mode = panel.getByRole('combobox', { name: 'Connection mode' })
    await expect(mode).toHaveText('Local CPA managed by JanusX')
    await expect(panel.locator('select')).toHaveCount(0)
    await expect(panel.getByRole('button', { name: 'Save and open CPA', exact: true })).toBeDisabled()
    await setCpaToggle(page, 'Enable local CPA', true)
    await expect(panel.getByRole('button', { name: 'Save and open CPA', exact: true })).toBeEnabled()
    const key = panel.getByLabel('Management key', { exact: true })
    await panel.getByRole('button', { name: 'Generate random key', exact: true }).click()
    await expect(key).toHaveValue(/^[a-f0-9]{64}$/)
    await panel.getByRole('button', { name: 'Show new key', exact: true }).click()
    await expect(key).toHaveAttribute('type', 'text')
    await panel.getByRole('button', { name: 'Hide new key', exact: true }).click()
    await expect(key).toHaveAttribute('type', 'password')
    await page.mouse.move(0, 0)
    for (const theme of ['planche', 'dark']) {
      await page.evaluate(async (theme) => { await (window as any).electron.theme.update(theme) }, theme)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await page.screenshot({ path: test.info().outputPath(`settings-managed-${theme}.png`) })
    }
    // A padding strip below a sticky footer would expose the covered runtime controls.
    await expect.poll(async () => {
      const footer = await panel.locator('footer').boundingBox()
      const scroller = await page.getByRole('dialog').locator('main').boundingBox()
      return footer && scroller ? Math.abs(footer.y + footer.height - scroller.y - scroller.height) : Infinity
    }).toBeLessThanOrEqual(1)
    // The shared select must remain keyboard-operable inside the settings modal.
    await mode.focus()
    await mode.press('ArrowDown')
    await mode.press('End')
    await mode.press('Enter')
    await expect(mode).toHaveText('Connect an existing instance')
    await expect(panel.getByLabel('Management key', { exact: true })).toHaveCount(0)
    const address = panel.getByRole('textbox', { name: 'Management page address' })
    await address.fill('file:///C:/invalid')
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(panel.getByRole('alert')).toContainText('HTTP or HTTPS')
    await address.fill('https://cpa.example.test/management.html')
    await expect(panel.getByRole('alert')).toHaveCount(0)
    await panel.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(panel.getByRole('status')).toContainText('Connection saved for all projects.')
    await page.evaluate(async () => { await (window as any).electron.theme.update('planche') })
    await page.screenshot({ path: test.info().outputPath('settings-external.png') })
    await mode.click()
    await page.getByRole('option', { name: 'Local CPA managed by JanusX', exact: true }).click()
    await expect(key).toHaveValue('')
    // Exercise container reflow below the desktop's ordinary minimum window size.
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.setMinimumSize(600, 600); window.setSize(680, 760)
    })
    // Windows may round native window bounds by one CSS pixel at fractional scaling.
    await expect.poll(async () => Math.abs(await page.evaluate(() => window.innerWidth) - 680)).toBeLessThanOrEqual(1)
    await expect.poll(() => panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await expect(panel.getByRole('button', { name: 'Save', exact: true })).toBeInViewport()
    await mode.click()
    await expect(page.getByRole('option', { name: 'Connect an existing instance', exact: true })).toBeVisible()
    await page.getByRole('option', { name: 'Connect an existing instance', exact: true }).click()
    await page.screenshot({ path: test.info().outputPath('settings-narrow.png') })
  } finally {
    if (app) await app.close()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

for (const tool of ['Browser', 'Markdown']) {
  test(`${tool} global page requires a full hold to close and can reopen`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'janusx-tool-close-'))
    let app: ElectronApplication | undefined
    try {
      const booted = await boot(root)
      app = booted.app
      const page = booted.page
      const trigger = page.locator('button[data-id="tool-menu"]')
      const tab = page.locator(`[data-tab-id^="${tool.toLowerCase()}:"]`)
      const close = tab.locator('[data-tab-close]')
      const open = async () => {
        await trigger.click()
        await page.getByRole('menuitem', { name: tool === 'Browser' ? 'Open the workspace browser' : 'Open a Markdown document', exact: true }).click()
        await expect(tab).toHaveCount(1)
        if (tool === 'Browser') {
          // Wait for the surface state to replace the provisional tab label;
          // the built-in start page intentionally has no attached native view.
          const id = (await tab.getAttribute('data-tab-id'))!.slice('browser:'.length)
          await expect(page.locator('[data-browser-start-page]')).toBeVisible()
          await expect.poll(() => page.evaluate(async id => {
            const state = await (window as any).electron.browser.getState(id)
            return state?.tabs.length > 0 && state.tabs.every((item: { isLoading: boolean }) => !item.isLoading)
          }, id)).toBe(true)
        }
      }
      await open()
      const tabId = await tab.getAttribute('data-tab-id')
      await tab.hover()
      await close.click()
      await expect(tab).toHaveCount(1)
      // Leaving midway must cancel the timer, even after its original deadline.
      await close.hover()
      await page.mouse.down()
      await page.waitForTimeout(300)
      await page.mouse.move(0, 0)
      await page.mouse.up()
      await page.waitForTimeout(800)
      await expect(tab).toHaveCount(1)
      await close.focus()
      await close.press('Space')
      await expect(tab).toHaveCount(1)
      await close.press('Space', { delay: 1100 })
      await expect(tab).toHaveCount(0)
      if (tool === 'Browser') {
        expect(await page.evaluate((id) => (window as any).electron.browser.getState(id), tabId!.slice('browser:'.length))).toBeNull()
        await expect.poll(() => nativeCount(app!)).toBe(0)
      }
      await open()
      await tab.hover()
      await close.click({ delay: 1500 })
      await expect(tab).toHaveCount(0)
    } finally {
      if (app) await app.close()
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
}

test('global browser focuses its popped-out singleton and reembeds without a project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'janusx-global-browser-'))
  let app: ElectronApplication | undefined
  try {
    const booted = await boot(root)
    app = booted.app
    const page = booted.page
    await page.locator('button[data-id="tool-menu"]').click()
    await page.locator('[role="menuitem"][data-id="browser"]').click()
    const tab = page.locator('[data-tab-id^="browser:"]')
    await expect(tab).toHaveCount(1)
    const id = (await tab.getAttribute('data-tab-id'))!.slice('browser:'.length)
    const [standalone] = await Promise.all([
      app.waitForEvent('window'),
      page.getByRole('button', { name: 'Pop out to standalone window', exact: true }).click(),
    ])
    await expect(tab).toHaveCount(0)
    await expect(standalone.getByRole('button', { name: 'Embed into main window', exact: true })).toBeVisible()
    await standalone.evaluate(() => (window as any).electron.window.minimize())
    await page.bringToFront()
    await page.locator('button[data-id="tool-menu"]').click()
    const entry = page.locator('[role="menuitem"][data-id="browser"]')
    await expect(entry).toBeEnabled()
    await entry.click()
    await expect.poll(() => app!.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows()
      return { count: windows.length, minimized: windows.some((win) => win.isMinimized()) }
    })).toEqual({ count: 2, minimized: false })
    await standalone.getByRole('button', { name: 'Embed into main window', exact: true }).click()
    await expect(tab).toHaveAttribute('data-tab-id', `browser:${id}`)
    await expect.poll(() => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await expect(page.locator('[data-pane-region="tools"]')).toBeVisible()
    expect(await page.evaluate((surfaceId) => (window as any).electron.browser.getState(surfaceId).then((state: any) => state.carrier), id)).toBe('pane')
  } finally {
    if (app) await app.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('CPA native page shares a global login, hides for dialogs, releases on close and reuses login after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'janusx-cpa-'))
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' })
    response.end(request.url === '/help' ? '<title>CPA help fixture</title><h1>Help</h1>' : fixtureHtml)
  })
  let app: ElectronApplication | undefined
  try {
    const origin = await listen(server)
    let booted = await boot(root)
    app = booted.app
    const page = booted.page
    await openCpa(page, `${origin}/management.html`)
    let web = await guest(app, origin)
    await web.getByRole('textbox', { name: 'Management key' }).fill('fixture-key')
    await web.getByRole('button', { name: 'Login', exact: true }).click()
    await expect(web.getByRole('heading', { name: 'Account quota fixture' })).toBeVisible()
    expect(await web.evaluate(() => ({ bridge: typeof (window as any).electron, node: typeof (window as any).require })))
      .toEqual({ bridge: 'undefined', node: 'undefined' })
    await expect.poll(() => nativeCount(app!)).toBe(1)
    await expectCompactCpa(app, page)
    const toolTrigger = page.locator('button[data-id="tool-menu"]')
    await toolTrigger.click()
    await expect(page.getByRole('menuitem', { name: 'CPA', exact: true })).toBeEnabled()
    await expect(page.getByRole('menuitem', { name: 'CPA', exact: true })).toContainText('Open')
    await expect.poll(() => nativeCount(app!)).toBe(0)
    await page.screenshot({ path: test.info().outputPath('cpa-titlebar-entry.png') })
    await page.keyboard.press('Escape')
    await expect.poll(() => nativeCount(app!)).toBe(1)
    await expect(page.locator('[data-pane-region="tools"]').getByRole('button', { name: 'New Terminal', exact: true })).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath('compact-cpa.png') })
    const originalWeb = web

    // A project switch leaves the global tools region and its guest intact.
    await mkdir(join(root, 'project-one'))
    await mkdir(join(root, 'project-two'))
    await page.evaluate(async ({ root }) => {
      for (const id of ['project-one', 'project-two']) await (window as any).electron.workspace.create({ name: id, path: `${root}/${id}` })
    }, { root })
    // Reload to load new workspace records. The isolated login must survive it.
    await page.reload()
    await page.getByTitle('Settings', { exact: true }).click()
    await page.locator('[data-tab="integrations"]').click()
    await page.getByRole('button', { name: 'Save and open CPA', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    web = await guest(app, origin)
    await expect(web.getByRole('heading', { name: 'Account quota fixture' })).toBeVisible()
    await page.locator('.ws').filter({ hasText: 'project-one' }).first().click()
    await page.locator('.ws').filter({ hasText: 'project-two' }).first().click()
    await expect(page.locator('[data-tab-id*="janusx.cpa"]')).toHaveCount(1)
    expect((await guest(app, origin))).toBe(web)
    expect(web).toBe(originalWeb)

    await page.getByRole('button', { name: 'Connection settings', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Connection settings' })).toBeVisible()
    await expect.poll(() => nativeCount(app!)).toBe(0)
    await page.getByRole('dialog', { name: 'Connection settings' }).getByRole('button', { name: 'Close', exact: true }).click()
    await expect.poll(() => nativeCount(app!)).toBe(1)
    await app.evaluate(({ shell }) => {
      ;(globalThis as any).__cpaHelpOpened = []
      shell.openExternal = async (url: string) => { (globalThis as any).__cpaHelpOpened.push(url) }
    })
    await web.locator('#popup').click()
    await expect.poll(() => app!.evaluate(() => (globalThis as any).__cpaHelpOpened)).toEqual([`${origin}/help`])
    expect(await page.evaluate(() => (window as any).electron.browser.getState('integration:cpa').then((state: any) => state.tabs.length))).toBe(1)
    await expect(web.getByRole('heading', { name: 'Account quota fixture' })).toBeVisible()

    await page.locator('[data-tab-id*="janusx.cpa"]').hover()
    await page.locator('[data-tab-id*="janusx.cpa"] [data-tab-close]').click()
    await expect(page.locator('[data-cpa-view]')).toBeVisible()
    await expect.poll(() => nativeCount(app!)).toBe(1)
    await closeCpa(page)
    await expect.poll(() => nativeCount(app!)).toBe(0)
    expect(await page.evaluate((id) => (window as any).electron.browser.getState(id), CPA_SURFACE_ID)).toBeNull()
    await toolTrigger.click()
    await expect(page.getByRole('menuitem', { name: 'CPA', exact: true })).toBeEnabled()
    await page.keyboard.press('Escape')

    await app.close()
    app = undefined
    booted = await boot(root)
    app = booted.app
    await openCpa(booted.page, `${origin}/management.html`)
    web = await guest(app, origin)
    await expect(web.getByRole('heading', { name: 'Account quota fixture' })).toBeVisible()
    const config = await readFile(join(root, 'profile', 'janusx', 'config.json'), 'utf8')
    expect(config).not.toContain('fixture-key')
  } finally { await cleanup(app, server, root) }
})

test('official CPAMC v1.26.5 renders, logs in, navigates to quotas and restores its own login', async () => {
  const frontendPath = process.env.JANUSX_E2E_CPA_HTML
  test.skip(!frontendPath, 'Set JANUSX_E2E_CPA_HTML to the pinned official management.html asset; no network download in this test.')
  const html = await readFile(frontendPath!)
  // Pin the upstream frontend; fake backend responses validate embedding, not real provider quota access.
  const expectedHash = process.env.JANUSX_E2E_CPA_SHA256
  expect(expectedHash, 'Supply the verified asset SHA-256').toBeTruthy()
  expect(createHash('sha256').update(html).digest('hex')).toBe(expectedHash)
  const root = await mkdtemp(join(tmpdir(), 'janusx-cpa-official-'))
  let authenticatedRequests = 0
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/management.html')) {
      response.writeHead(200, { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' })
      response.end(html)
      return
    }
    if (request.headers.authorization === 'Bearer fixture-key') authenticatedRequests++
    response.writeHead(200, { 'Content-Type': 'application/json', 'X-CPA-VERSION': 'v8.0.0' })
    if (request.url?.endsWith('/auth-files')) response.end('{"files":[]}')
    else if (request.url?.endsWith('/models')) response.end('{"data":[]}')
    else response.end('{}')
  })
  let app: ElectronApplication | undefined
  try {
    const origin = await listen(server)
    const booted = await boot(root)
    app = booted.app
    await openCpa(booted.page, `${origin}/management.html`)
    const web = await guest(app, origin)
    await web.locator('input[name="cpa-management-key"]').fill('fixture-key')
    const remember = web.getByRole('checkbox', { name: /Remember password|记住密码/ })
    // The upstream input is covered by its styled box; click its visible label.
    if (!await remember.isChecked()) await web.locator('label').filter({ has: remember }).click()
    await expect(remember).toBeChecked()
    await web.getByRole('button', { name: /^(Login|登录|连接)$/ }).click()
    await expect.poll(() => authenticatedRequests).toBeGreaterThan(0)
    await expect(web.locator('input[name="cpa-management-key"]')).toHaveCount(0)
    const quotaNavigation = web.getByRole('link', { name: /^(Quota Management|配额管理)$/ })
    await quotaNavigation.click()
    await expect.poll(() => web.url()).toContain('quota')
    await web.reload()
    await expect(quotaNavigation).toBeVisible()
    await expect(web.locator('input[name="cpa-management-key"]')).toHaveCount(0)
    expect(await web.evaluate(() => typeof (window as any).electron)).toBe('undefined')
    await booted.page.screenshot({ path: test.info().outputPath('official-cpa-in-workspace.png') })
  } finally { await cleanup(app, server, root) }
})

test('managed CPA downloads verified components, runs the real Windows service and preserves accounts on restart and quit', async () => {
  const zipPath = process.env.JANUSX_E2E_CPA_ZIP, htmlPath = process.env.JANUSX_E2E_CPA_HTML
  test.skip(process.platform !== 'win32' || !zipPath || !htmlPath, 'Supply pinned official Windows ZIP and management HTML assets.')
  test.setTimeout(120_000)
  const archiveHash = '28bde34eb33a1b03884bac1e8c1a402a25ae4eadd3c60df7ae0df53f8b281318'
  const htmlHash = '57558cd023475674634a114824b014d3e5ac161f6f3791e3d86b6adab962a700'
  expect(createHash('sha256').update(await readFile(zipPath!)).digest('hex')).toBe(archiveHash)
  expect(createHash('sha256').update(await readFile(htmlPath!)).digest('hex')).toBe(htmlHash)
  const root = await mkdtemp(join(tmpdir(), 'janusx-cpa-managed-'))
  let app: ElectronApplication | undefined
  const occupied = createTcpServer()
  const callbackBlocker = createTcpServer()
  const proxyTargets: string[] = []
  const proxy = createServer((request, response) => {
    const url = new URL(request.url!)
    if (url.hostname !== 'quota-fixture.invalid' || request.headers.authorization !== 'Bearer fixture-access') {
      response.writeHead(401); response.end('{}'); return
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ fixturePath: url.pathname, rate_limit: { primary_window: { used_percent: 10 } } }))
  })
  proxy.on('connect', (request, socket) => {
    proxyTargets.push(request.url ?? '')
    socket.end('HTTP/1.1 502 Fixture proxy blocked upstream\r\nContent-Length: 0\r\nConnection: close\r\n\r\n', () => socket.destroy())
  })
  try {
    // Deterministically exercise fallback, including machines where Windows has not excluded 1455.
    await new Promise<void>((resolve, reject) => {
      callbackBlocker.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EACCES' || error.code === 'EADDRINUSE') resolve()
        else reject(error)
      })
      callbackBlocker.listen(1455, '0.0.0.0', resolve)
    })
    const proxyOrigin = await listen(proxy)
    const proxyEnv = { HTTP_PROXY: proxyOrigin, HTTPS_PROXY: proxyOrigin, http_proxy: proxyOrigin, https_proxy: proxyOrigin,
      NO_PROXY: 'localhost,127.0.0.1,::1', no_proxy: 'localhost,127.0.0.1,::1' }
    const booted = await boot(root, proxyEnv); app = booted.app
    const { page } = booted
    // Only transport is replaced. The production installer, checksums, extraction,
    // encrypted storage and official CPA executable run unchanged.
    await app.evaluate(async (_electron, input) => {
      const fs = process.getBuiltinModule('fs/promises') as typeof import('node:fs/promises')
      const original = globalThis.fetch
      globalThis.fetch = async (url, options) => {
        const address = String(url)
        const backend = 'https://api.github.com/repos/router-for-me/CLIProxyAPI/releases/latest'
        const frontend = 'https://api.github.com/repos/router-for-me/Cli-Proxy-API-Management-Center/releases/latest'
        if (address === backend || address === frontend) {
          const isBackend = address === backend
          const repo = isBackend ? 'CLIProxyAPI' : 'Cli-Proxy-API-Management-Center'
          const tag = isBackend ? 'v8.0.31' : 'v1.26.5'
          const name = isBackend ? 'CLIProxyAPI_8.0.31_windows_amd64.zip' : 'management.html'
          const size = (await fs.stat(isBackend ? input.zipPath : input.htmlPath)).size
          return new Response(JSON.stringify({ tag_name: tag, draft: false, prerelease: false, assets: [{
            name, size, browser_download_url: `https://github.com/router-for-me/${repo}/releases/download/${tag}/${name}`,
            digest: 'sha256:' + (isBackend ? input.archiveHash : input.htmlHash),
          }] }), { status: 200 })
        }
        if (address.startsWith('https://github.com/router-for-me/CLIProxyAPI/releases/download/')) {
          return new Response(new Uint8Array(await fs.readFile(input.zipPath)), { headers: { 'content-length': '23699580' } })
        }
        if (address.startsWith('https://github.com/router-for-me/Cli-Proxy-API-Management-Center/releases/download/')) {
          return new Response(new Uint8Array(await fs.readFile(input.htmlPath)), { headers: { 'content-length': '3312180' } })
        }
        if (address.endsWith('/v1.26.5/LICENSE')) return new Response('MIT fixture license; full upstream asset is verified separately')
        return original(url, options)
      }
    }, { zipPath: zipPath!, htmlPath: htmlPath!, archiveHash, htmlHash })

    await page.getByTitle('Settings', { exact: true }).click()
    await page.locator('[data-tab="integrations"]').click()
    await expect(page.getByRole('combobox', { name: 'Connection mode' })).toHaveText('Local CPA managed by JanusX')
    await setCpaToggle(page, 'Enable local CPA', true)
    await setCpaToggle(page, 'Automatically check and download updates', false)
    const port = await freePort()
    await page.getByRole('spinbutton', { name: 'Local port', exact: true }).fill(String(port))
    const keyField = page.getByLabel('Management key', { exact: true })
    await keyField.fill('short')
    await page.getByRole('button', { name: 'Save and open CPA', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('8–128')
    await page.getByRole('button', { name: 'Generate random key', exact: true }).click()
    await expect(keyField).toHaveValue(/^[a-f0-9]{64}$/)
    await page.getByRole('button', { name: 'Show new key', exact: true }).click()
    await expect(keyField).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide new key', exact: true }).click()
    await expect(keyField).toHaveAttribute('type', 'password')
    await keyField.fill('janusx-custom-initial-2026')
    await page.getByRole('button', { name: 'Save and open CPA', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 40_000 })
    const origin = `http://127.0.0.1:${port}`
    const web = await guest(app, origin)
    await expect(web.locator('input[name="cpa-management-key"]')).toBeVisible()
    const status = await page.evaluate(() => (window as any).electron.cpa.status())
    expect(status.phase).toBe('running'); expect(status.version).toContain('v8.0.31')
    await expectCompactCpa(app, page, true)
    await page.screenshot({ path: test.info().outputPath('compact-managed-cpa.png') })
    let key = await app.evaluate(({ app, safeStorage }) => {
      const fs = process.getBuiltinModule('fs') as typeof import('node:fs')
      const path = process.getBuiltinModule('path') as typeof import('node:path')
      return safeStorage.decryptString(fs.readFileSync(path.join(app.getPath('userData'), 'janusx', 'components', 'cpa', 'management-key.enc')))
    })
    expect(key).toBe('janusx-custom-initial-2026')
    await page.getByRole('button', { name: 'Copy management key', exact: true }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(key)
    await web.locator('input[name="cpa-management-key"]').fill(key)
    await web.getByRole('button', { name: /^(Login|登录|连接)$/ }).click()
    const quota = web.getByRole('link', { name: /^(Quota Management|配额管理)$/ })
    await expect(quota).toBeVisible()
    await quota.click()
    await expect.poll(() => web.url()).toContain('quota')
    await verifyManagedOAuth(app, page, web, origin, key, proxyTargets)
    const configPath = join(root, 'profile', 'janusx', 'components', 'cpa', 'config.yaml')
    const accountSentinel = join(root, 'profile', 'janusx', 'components', 'cpa', 'accounts', '.preservation-test')
    await writeFile(accountSentinel, 'keep-across-restarts')
    expect(await readFile(configPath, 'utf8')).not.toContain(key)
    expect(await readFile(join(root, 'profile', 'janusx', 'config.json'), 'utf8')).not.toContain(key)

    await page.locator('[data-tab-id*="janusx.cpa"]').hover()
    await closeCpa(page)
    expect(await page.evaluate(() => (window as any).electron.cpa.status().then((value: any) => value.phase))).toBe('running')
    expect(await page.evaluate(() => (window as any).electron.cpa.status().then((value: any) => value.oauthFallback))).toBeUndefined()
    expect((await fetch(`${origin}/management.html`)).status).toBe(200)

    await page.getByTitle('Settings', { exact: true }).click()
    await page.locator('[data-tab="integrations"]').click()
    await expect(page.getByLabel('Management key', { exact: true })).toHaveValue('')
    await page.getByLabel('Management key', { exact: true }).fill('janusx-custom-rotated-2026')
    await page.screenshot({ path: test.info().outputPath('custom-key-settings.png') })
    await page.getByRole('button', { name: 'Save and restart CPA', exact: true }).click()
    await expect(page.getByText('The new management key is saved encrypted.', { exact: false })).toBeVisible({ timeout: 25_000 })
    await expect(page.getByLabel('Management key', { exact: true })).toHaveValue('')
    const oldKeyResponse = await fetch(`${origin}/v8/management/config`, { headers: { Authorization: `Bearer ${key}` } })
    expect(oldKeyResponse.status).toBe(401)
    await oldKeyResponse.body?.cancel()
    key = 'janusx-custom-rotated-2026'
    const newKeyResponse = await fetch(`${origin}/v8/management/config`, { headers: { Authorization: `Bearer ${key}` } })
    expect(newKeyResponse.status).toBe(200)
    await newKeyResponse.body?.cancel()
    expect(await readFile(accountSentinel, 'utf8')).toBe('keep-across-restarts')
    expect(await readFile(configPath, 'utf8')).not.toContain(key)
    expect(await readFile(join(root, 'profile', 'janusx', 'config.json'), 'utf8')).not.toContain(key)
    await page.getByRole('button', { name: 'Save and open CPA', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 25_000 })
    const rotatedWeb = await guest(app, origin)
    await expect(rotatedWeb.locator('input[name="cpa-management-key"]')).toBeVisible()
    await rotatedWeb.locator('input[name="cpa-management-key"]').fill(key)
    await rotatedWeb.getByRole('button', { name: /^(Login|登录|连接)$/ }).click()
    await expect(rotatedWeb.getByRole('link', { name: /^(Quota Management|配额管理)$/ })).toBeVisible()
    await page.locator('[data-tab-id*="janusx.cpa"]').hover()
    await closeCpa(page)
    await page.getByTitle('Settings', { exact: true }).click()
    await page.locator('[data-tab="integrations"]').click()
    const changedPort = await freePort()
    await page.getByRole('spinbutton', { name: 'Local port', exact: true }).fill(String(changedPort))
    await page.getByRole('button', { name: 'Save and restart CPA', exact: true }).click()
    await expect(page.getByText('Connection saved for all projects.', { exact: true })).toBeVisible({ timeout: 25_000 })
    await expect.poll(async () => { try { await fetch(`${origin}/management.html`); return false } catch { return true } }).toBe(true)
    expect((await fetch(`http://127.0.0.1:${changedPort}/management.html`)).status).toBe(200)
    expect(await readFile(accountSentinel, 'utf8')).toBe('keep-across-restarts')

    await occupied.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => occupied.listening ? resolve() : occupied.once('listening', resolve))
    const occupiedPort = (occupied.address() as { port: number }).port
    await page.getByRole('spinbutton', { name: 'Local port', exact: true }).fill(String(occupiedPort))
    await page.getByRole('button', { name: 'Save and restart CPA', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'occupied' }).first()).toBeVisible()
    expect(occupied.listening).toBe(true)
    await page.getByRole('spinbutton', { name: 'Local port', exact: true }).fill(String(changedPort))
    await page.getByRole('button', { name: 'Save and open CPA', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 25_000 })
    const finalOrigin = `http://127.0.0.1:${changedPort}`
    expect((await fetch(`${finalOrigin}/management.html`)).status).toBe(200)
    await app.close(); app = undefined
    await expect.poll(async () => { try { await fetch(`${finalOrigin}/management.html`); return false } catch { return true } }).toBe(true)
    expect(await readFile(configPath, 'utf8')).not.toContain(key)
    const rebooted = await boot(root, proxyEnv); app = rebooted.app
    await rebooted.page.getByTitle('Settings', { exact: true }).click()
    await rebooted.page.locator('[data-tab="integrations"]').click()
    await rebooted.page.getByRole('button', { name: 'Save and open CPA', exact: true }).click()
    await expect(rebooted.page.getByRole('dialog')).toHaveCount(0, { timeout: 25_000 })
    expect((await fetch(`${finalOrigin}/management.html`)).status).toBe(200)
    await rebooted.page.getByRole('button', { name: 'Copy management key', exact: true }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(key)
    expect(await readFile(accountSentinel, 'utf8')).toBe('keep-across-restarts')
  } finally {
    if (app) await app.close()
    const log = await readFile(join(root, 'profile', 'janusx', 'components', 'cpa', 'cpa.log')).catch(() => Buffer.from('no CPA log'))
    await test.info().attach('managed-cpa-log', { body: log, contentType: 'text/plain' })
    await test.info().attach('proxy-targets', { body: JSON.stringify(proxyTargets), contentType: 'application/json' })
    if (occupied.listening) await new Promise<void>((resolve) => occupied.close(() => resolve()))
    if (callbackBlocker.listening) await new Promise<void>((resolve) => callbackBlocker.close(() => resolve()))
    if (proxy.listening) await new Promise<void>((resolve) => proxy.close(() => resolve()))
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
