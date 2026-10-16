import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
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
