import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { createServer as createTcpServer } from 'node:net'
import { createDesktopTestEnv } from './desktop-test-env'
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

async function boot(root: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: [resolve('out/main/index.js'), `--user-data-dir=${join(root, 'profile')}`], env: createDesktopTestEnv(root) })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => (window as any).electron.system.setLanguage('en'))
  await page.reload()
  return { app, page }
}

async function openCpa(page: Page, url: string): Promise<void> {
  await page.evaluate(async (managementUrl) => {
    await ((window as any).electron.cpa as CpaAPI).saveSettings({ managementUrl })
  }, url)
  // The settings entry works before any project or pane exists.
  await page.getByTitle('Settings', { exact: true }).click()
  await page.locator('[data-tab="integrations"]').click()
  await expect(page.getByRole('textbox', { name: 'Management page address' })).toHaveValue(url)
  await page.getByRole('button', { name: 'Save and open CPA', exact: true }).click()
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

async function freePort(): Promise<number> {
  const server = createTcpServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

async function cleanup(app: ElectronApplication | undefined, server: Server, root: string) {
  if (app) await app.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

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
    const originalWeb = web

    // A project switch transfers the application contribution with its guest intact.
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
    await web.locator('#popup').click()
    await expect.poll(async () => page.evaluate(() => (window as any).electron.browser.getState('integration:cpa').then((state: any) => state.tabs.length))).toBe(2)

    await page.locator('[data-tab-id*="janusx.cpa"]').hover()
    await page.locator('[data-tab-id*="janusx.cpa"] [data-tab-close]').click()
    await expect.poll(() => nativeCount(app!)).toBe(0)
    expect(await page.evaluate((id) => (window as any).electron.browser.getState(id), CPA_SURFACE_ID)).toBeNull()

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
  try {
    const booted = await boot(root); app = booted.app
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
    await expect(page.getByRole('combobox', { name: 'Connection mode' })).toHaveValue('managed')
    await page.getByRole('checkbox', { name: 'Enable local CPA', exact: true }).check()
    await page.getByRole('checkbox', { name: 'Automatically check and download updates' }).uncheck()
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
    const configPath = join(root, 'profile', 'janusx', 'components', 'cpa', 'config.yaml')
    const accountSentinel = join(root, 'profile', 'janusx', 'components', 'cpa', 'accounts', '.preservation-test')
    await writeFile(accountSentinel, 'keep-across-restarts')
    expect(await readFile(configPath, 'utf8')).not.toContain(key)
    expect(await readFile(join(root, 'profile', 'janusx', 'config.json'), 'utf8')).not.toContain(key)

    await page.locator('[data-tab-id*="janusx.cpa"]').hover()
    await page.locator('[data-tab-id*="janusx.cpa"] [data-tab-close]').click()
    expect(await page.evaluate(() => (window as any).electron.cpa.status().then((value: any) => value.phase))).toBe('running')
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
    await page.locator('[data-tab-id*="janusx.cpa"] [data-tab-close]').click()
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
    const rebooted = await boot(root); app = rebooted.app
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
    if (occupied.listening) await new Promise<void>((resolve) => occupied.close(() => resolve()))
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
