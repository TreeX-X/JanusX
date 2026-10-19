// Real JanusX captures. Run from the app checkout; only clean fixtures and immutable CPA components are used.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';

const appRoot = resolve(process.env.JANUSX_APP_ROOT || '../JanusX');
const require = createRequire(join(appRoot, 'package.json'));
const { expect } = require('playwright/test');
const helper = name => import(pathToFileURL(join(appRoot, 'scripts/showcase', name)).href);
const { createFixture } = await helper('cli-fixture.mjs');
const { launchApp, prepareRepo, ensureWorkspace, ensureSidebarExpanded, openWorkspace, runRecord, sleep } = await helper('record-lib.mjs');
const { readyWindow, captureNative } = await helper('static-lib.mjs');
const output = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/workspace');
const components = process.env.SHOWCASE_CPA_COMPONENTS;
if (!components) throw new Error('SHOWCASE_CPA_COMPONENTS must point to installed immutable CPA components.');
const installed = JSON.parse(await readFile(join(components, 'current.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(output, { recursive: true });
const portServer = createServer();
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));

await runRecord(async ctx => {
  const fixture = await createFixture(ctx);
  for (const path of [join(fixture.claudeConfig, '.claude.json'), join(fixture.env.PI_CODING_AGENT_DIR, 'settings.json')]) {
    const settings = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(path, JSON.stringify({ ...settings, theme: 'dark' }));
  }
  const { repoPath, recordingRoot } = await prepareRepo('website-dark', { repoParent: fixture.fixtureRoot, repoName: 'Atlas' });
  ctx.recordingRoot = recordingRoot;
  const target = join(fixture.fixtureRoot, 'user-data/janusx/components/cpa/versions', installed.id);
  await mkdir(target, { recursive: true });
  await writeFile(join(target, '../../current.json'), JSON.stringify(installed));
  const hashes = {};
  for (const name of ['cli-proxy-api.exe', 'management.html', 'LICENSE', 'MANAGEMENT-LICENSE']) {
    const bytes = await readFile(join(components, 'versions', installed.id, name));
    if (name === 'cli-proxy-api.exe') expect(digest(bytes)).toBe(installed.binaryHash);
    if (name === 'management.html') expect(digest(bytes)).toBe(installed.pageHash);
    await writeFile(join(target, name), bytes);
    hashes[name] = digest(bytes);
  }
  const { application, page } = await launchApp(fixture.fixtureRoot, fixture.claudeConfig, { env: fixture.env });
  Object.assign(ctx, { application, page });
  await readyWindow(application, page, 'dark');
  await ensureWorkspace(page, 'Atlas', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'Atlas');
  const project = page.locator('[data-pane-region="project"]');
  const tools = page.locator('[data-pane-region="tools"]');
  const drafts = { Claude: 'Implement local search for the task board.', Codex: 'Review search edge cases and keyboard access.', OpenCode: 'Add tests for empty search results.', Pi: 'Prepare the release checklist and explain data flow.' };
  const tab = name => project.locator('[data-tab-id]').filter({ hasText: new RegExp(`^${name}$`, 'i') });
  const paneOf = name => project.locator('section[data-pane-id]').filter({ has: page.locator('[data-tab-id]').filter({ hasText: new RegExp(`^${name}$`, 'i') }) });
  for (const [index, name] of Object.keys(drafts).entries()) {
    if (!index) await page.getByRole('main').getByRole('button', { name, exact: true }).click();
    else {
      await page.getByRole('button', { name: 'New Terminal', exact: true }).first().click();
      const item = page.getByRole('menuitem', { name: `New ${name} terminal`, exact: true });
      await expect(item).toBeVisible(); await sleep(250); await item.click();
    }
    await expect(tab(name)).toHaveCount(1);
    await sleep(4000);
  }
  for (const [name, draft] of Object.entries(drafts)) {
    await tab(name).click();
    const input = project.locator('.xterm-helper-textarea:visible');
    let ready = false, stable = 0;
    for (let attempt = 0; attempt < 45; attempt++) {
      await sleep(700);
      const text = await project.locator('.xterm-rows:visible').innerText();
      await input.focus();
      if (/Dark mode|Light mode/.test(text)) await input.press('Enter');
      else if (/Is this a project you created|Yes, I trust this folder/.test(text)) { await input.press('ArrowDown'); await input.press('Enter'); }
      else if (/Detected a custom API key/.test(text)) { await input.press('ArrowUp'); await input.press('Enter'); }
      else if (/Make auto mode your default permission mode/.test(text)) { await input.press('ArrowDown'); await input.press('Enter'); }
      else if (/Trust this folder\?/.test(text)) await input.press('Enter');
      else if (/Hooks need review|new MCP servers/.test(text)) await input.press('Escape');
      else if (/Set up the Codex agent sandbox/.test(text)) { await input.press('ArrowDown'); await input.press('Enter'); }
      else if ((name === 'Claude' && /Claude Code v/.test(text) && /for shortcuts|shift\+tab to cycle/.test(text))
        || (name === 'Codex' && /context left|Ask Codex|for shortcuts/.test(text))
        || (name === 'OpenCode' && /tab agents|ctrl\+p commands/.test(text))
        || (name === 'Pi' && /0\.0%\/.*demo/s.test(text))) {
        if (++stable >= 3) { ready = true; break; }
        continue;
      }
      stable = 0;
    }
    if (!ready) throw new Error(`${name} did not reach its ready state`);
    await page.keyboard.insertText(draft);
    await expect.poll(async () => (await project.locator('.xterm-rows:visible').innerText()).replace(/\s/g, '')).toContain(draft.replace(/\s/g, ''));
    console.log(`${name}: real terminal ready, draft not submitted`);
  }
  async function split(source, target, edge) {
    const s = await source.boundingBox(), t = await target.boundingBox();
    await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2); await page.mouse.down();
    await page.mouse.move(edge === 'right' ? t.x + t.width - 24 : t.x + t.width * .55,
      edge === 'right' ? t.y + t.height * .48 : t.y + t.height - 24, { steps: 24 });
    await page.mouse.up(); await sleep(500);
  }
  await split(tab('Codex'), paneOf('Claude'), 'right');
  await split(tab('OpenCode'), paneOf('Claude'), 'bottom');
  await split(tab('Pi'), paneOf('Codex'), 'bottom');
  await expect(project.locator('section[data-pane-id]:visible')).toHaveCount(4);
  const captures = [];
  async function capture(name) {
    await page.mouse.move(1758, 882); await sleep(1200);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
    const shot = await captureNative(application, page);
    await writeFile(join(recordingRoot, `${name}.png`), shot.png);
    captures.push({ file: `${name}.png`, sha256: digest(shot.png), width: 1760, height: 884,
      projectPanes: await project.locator('section[data-pane-id]:visible').count(),
      toolPanes: await tools.locator('section[data-pane-id]:visible').count(), nativeViews: shot.nativeViews.length });
    console.log(`Captured ${name}`);
  }
  await capture('terminals');
  await page.evaluate(input => window.electron.cpa.saveSettings(input), { mode: 'managed', enabled: true, autoUpdate: false, port, managementUrl: `http://127.0.0.1:${port}/management.html` });
  await page.locator('[data-id="tool-menu"]').click();
  await page.locator('[role="menuitem"]').filter({ hasText: 'CPA' }).click();
  const origin = `http://127.0.0.1:${port}`;
  await expect.poll(() => page.evaluate(() => window.electron.cpa.status().then(s => s.phase)), { timeout: 40000 }).toBe('running');
  await expect.poll(() => application.context().pages().some(p => p.url().startsWith(origin))).toBe(true);
  const web = application.context().pages().find(p => p.url().startsWith(origin));
  await expect(web.locator('input[name="cpa-management-key"]')).toBeVisible();
  const key = await application.evaluate(({ app, safeStorage }) => {
    const fs = process.getBuiltinModule('fs'), path = process.getBuiltinModule('path');
    return safeStorage.decryptString(fs.readFileSync(path.join(app.getPath('userData'), 'janusx/components/cpa/management-key.enc')));
  });
  await web.locator('input[name="cpa-management-key"]').fill(key);
  await web.getByRole('button', { name: /^(Login|登录|连接)$/ }).click();
  await expect(web.locator('input[name="cpa-management-key"]')).toHaveCount(0);
  await sleep(2500);
  // Use the official management page's own appearance control.
  // CPA maintains its own theme, independently of the app shell.
  const themeButton = web.getByRole('button', { name: /theme|主题|外观|深色|暗色/i });
  if (await themeButton.count() === 1) {
    await themeButton.click(); await sleep(300);
    await web.getByText('暗色', { exact: true }).click();
  }
  await sleep(500);
  expect(await web.locator('html').getAttribute('data-theme')).toBe('dark');
  const collapseCPA = web.getByRole('button', { name: '收起侧边栏', exact: true });
  if (await collapseCPA.count()) await collapseCPA.click();
  await capture('cpa');
  const markdown = '# Search rollout\n\nOne workspace. A clear path to release.\n\n## Release checklist\n\n- [x] Ignore case and trim whitespace\n- [x] Keep the original task order\n- [ ] Review empty results\n- [ ] Check keyboard navigation\n\n## Working together\n\n| Task | Workspace |\n| --- | --- |\n| Implementation | Claude + OpenCode |\n| Review | Codex |\n| Release notes | Pi |\n\n> Keep the preview beside the work.\n';
  await page.locator('[data-id="tool-menu"]').click();
  await page.locator('[role="menuitem"][data-id="markdown"]').click();
  await page.getByRole('combobox', { name: '文稿归属', exact: true }).selectOption({ label: 'Atlas' });
  await page.getByRole('button', { name: '新建笔记', exact: true }).first().click();
  await page.getByRole('textbox', { name: '笔记标题', exact: true }).fill('Search rollout');
  await page.getByRole('textbox', { name: '笔记内容', exact: true }).fill(markdown);
  await page.getByRole('button', { name: '折叠笔记列表', exact: true }).click();
  await page.getByRole('button', { name: '分栏', exact: true }).click();
  await capture('documents');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  const mdTab = tools.locator('[data-tab-id^="markdown:"]');
  const cpaTab = tools.locator('[data-tab-id]').filter({ hasText: 'CPA' });
  await cpaTab.click();
  await split(mdTab, tools.locator('section[data-pane-id]'), 'bottom');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(tools.locator('section[data-pane-id]:visible')).toHaveCount(2);
  await capture('overview');
  expect(captures.at(-1).nativeViews).toBe(1);
  await page.evaluate(() => window.electron.cpa.stop());
  const report = { createdAt: new Date().toISOString(), theme: 'dark',
    appEntrySha256: digest(await readFile(resolve(process.env.SHOWCASE_ENTRY || 'out/main/index.js'))),
    buildSourcesPinned: false, cpa: { backend: installed.backend, frontend: installed.frontend, hashes, authenticationFiles: 0, requests: 0 },
    accountsCopied: false, promptsSubmitted: 0, markdown: 'Authored local demonstration document', captures };
  for (const item of captures) {
    const bytes = await readFile(join(recordingRoot, item.file));
    expect(digest(bytes)).toBe(item.sha256);
    await writeFile(join(output, item.file), bytes);
  }
  await writeFile(join(output, 'capture.json'), JSON.stringify(report, null, 2) + '\n');
});
