// F/R/M: authored Atlas content in genuine file, browser and Markdown tools.
import { expect } from 'playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createFixture } from './cli-fixture.mjs';
import { files, buildEvidence } from './blueprint-fixture.mjs';
import { prepareRepo, launchApp, ensureWorkspace, ensureSidebarExpanded, openWorkspace, runRecord, sleep, git } from './record-lib.mjs';
import { readyWindow, saveStill, finishStills, startPi, resizeByKeyboard } from './static-lib.mjs';

const markdown = '# Search rollout\n\nKeep search local, predictable and easy to review.\n\n## Release checklist\n\n- [x] Ignore case and trim whitespace\n- [x] Keep the original task order\n- [x] Show all tasks below two characters\n- [ ] Review the empty-result message\n\n## Ownership\n\n| Area | Owner |\n| --- | --- |\n| Implementation | OpenCode |\n| Review | Pi |\n\n`npm test` — 3 checks passing.\n';
const board = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Atlas · Task board</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f2;color:#293d43;font:14px/1.5 system-ui;padding:30px}header{display:flex;justify-content:space-between;align-items:center}small{font-size:10px;letter-spacing:2px;color:#7d8c8c}h1{font-size:30px;margin:6px 0 22px;font-weight:600}header span{font-size:11px;border:1px solid #cbd5cf;border-radius:12px;padding:4px 10px}input{width:100%;border:1px solid #cbd4cf;background:#fff;border-radius:7px;padding:12px;color:#293d43;font:inherit;outline:none}article{background:#fff;border:1px solid #dde2dc;border-radius:8px;padding:18px;margin-top:14px}article b{display:block;font-size:15px;font-weight:550}article span{font-size:12px;color:#748280}footer{font-size:12px;margin-top:20px;color:#7d8c8c}article[hidden]{display:none}</style>
<header><div><small>ATLAS / WORKSPACE</small><h1>Task board</h1></div><span>Local preview</span></header><input aria-label="Filter tasks" placeholder="Filter tasks…"><main><article data-title="Search tasks"><b>Search tasks</b><span>In progress · OpenCode</span></article><article data-title="Search empty state"><b>Search empty state</b><span>Review · Pi</span></article><article data-title="Release checklist"><b>Release checklist</b><span>Backlog</span></article></main><footer>Local title search · original order preserved</footer><script>document.querySelector('input').oninput=e=>{for(const card of document.querySelectorAll('article'))card.hidden=!card.dataset.title.toLowerCase().includes(e.target.value.toLowerCase())}</script></html>`;
const server = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(req.url === '/guide' ? board.replace('Task board', 'Search guide').replace('<main>', '<p>Trim whitespace · ignore case · preserve order.</p><main>') : board); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try { await runRecord(async ctx => {
  const fixture = await createFixture(ctx);
  const { recordingRoot, repoPath } = await prepareRepo('tools-stills', { repoParent: fixture.fixtureRoot, repoName: 'Atlas' });
  ctx.recordingRoot = recordingRoot;
  for (const [path, content] of Object.entries(files)) { await mkdir(dirname(join(repoPath, path)), { recursive: true }); await writeFile(join(repoPath, path), content); }
  git(repoPath, 'add', '-A'); git(repoPath, 'commit', '-m', 'Prepare Atlas tool stills');
  const source = '/**\n * Filter the task board without a network request.\n * Whitespace and letter case do not affect matching.\n * Short queries keep all tasks; matching preserves order.\n */\n' + files['src/search.mjs'] + '\n/** Text shown above the filtered task list. */\nexport function searchSummary(tasks, query) {\n  const results = filterTasks(tasks, query);\n  if (query.trim().length < 2) {\n    return `${tasks.length} tasks in this workspace`;\n  }\n  if (results.length === 0) {\n    return `No tasks match "${query.trim()}"`;\n  }\n  return `${results.length} of ${tasks.length} tasks`;\n}\n\n// Keep filtering local; preserve the original task order.\n';
  await writeFile(join(repoPath, 'src/search.mjs'), source);
  const testOutput = execFileSync(process.execPath, ['--test'], { cwd: repoPath, encoding: 'utf8' });
  expect(testOutput).toContain('pass 3');
  const piSettings = join(fixture.env.PI_CODING_AGENT_DIR, 'settings.json');
  const pi = JSON.parse(await readFile(piSettings, 'utf8')); await writeFile(piSettings, JSON.stringify({ ...pi, theme: 'dark' }));
  let launched = await launchApp(fixture.fixtureRoot, fixture.claudeConfig, { env: fixture.env }); Object.assign(ctx, launched);
  let { application, page } = launched;
  await readyWindow(application, page, 'dark');
  await ensureWorkspace(page, 'Atlas', repoPath); await ensureSidebarExpanded(page); await openWorkspace(page, 'Atlas');
  await startPi(page, 'Review src/search.mjs against tests/search.test.mjs. Check whitespace, letter case, short queries and empty results. Keep filtering local and preserve the task order. Run npm test before changing the implementation.');
  await page.getByRole('button', { name: /打开文件工具/ }).first().click();
  const search = page.getByPlaceholder('搜索文件...'); await expect(search).toBeVisible();
  await search.fill('search');
  const row = page.locator('[data-file-path="src/search.mjs"]').first(); await expect(row).toBeVisible();
  const popup = application.waitForEvent('window'); await row.dblclick(); const editor = await popup;
  await editor.getByRole('button', { name: '嵌入主窗口工作区' }).click();
  await expect(page.getByRole('region', { name: 'Embedded file editor' })).toBeVisible();
  await sleep(1500);
  await expect(page.locator('[data-file-path="src/search.mjs"]').first()).toContainText('search.mjs');
  const code = page.getByRole('region', { name: 'Embedded file editor' }); await expect(code).toContainText('filterTasks');
  const assets = [await saveStill(ctx, 'feature-filetree', { search: await search.inputValue(), codeFile: 'src/search.mjs', modifiedFile: true,
    source: await readFile(join(repoPath, 'src/search.mjs'), 'utf8'), fileRow: await row.innerText() })];
  // A fresh window keeps the light terminal consistent with the default theme.
  await application.close(); ctx.application = null;
  await writeFile(piSettings, JSON.stringify({ ...pi, theme: 'light' }));
  ({ application, page } = await launchApp(fixture.fixtureRoot, fixture.claudeConfig, { env: fixture.env })); Object.assign(ctx, { application, page });
  await readyWindow(application, page, 'planche');
  await openWorkspace(page, 'Atlas');
  // Close the persisted file tool/editor through their real controls if present.
  const embedded = page.getByRole('region', { name: 'Embedded file editor' });
  if (await embedded.count()) await embedded.getByRole('button', { name: /关闭/ }).last().click();
  if (await page.getByPlaceholder('搜索文件...').isVisible()) await page.getByRole('button', { name: /打开文件工具/ }).first().click();
  await startPi(page, 'Review the local task board. Compare the two search results with the release checklist, and check that filtering keeps the original task order.');
  await page.locator('[data-id="tool-menu"]').click(); await page.locator('[role="menuitem"][data-id="browser"]').click();
  const address = page.getByRole('textbox', { name: '地址栏', exact: true });
  await address.fill(origin + '/guide'); await address.press('Enter');
  await expect.poll(() => application.context().pages().some(p => p.url().startsWith(origin))).toBe(true);
  await page.getByRole('button', { name: '新建标签页', exact: true }).click();
  await address.fill(origin); await address.press('Enter');
  await expect.poll(() => application.context().pages().filter(p => p.url().startsWith(origin)).length).toBe(2);
  const web = application.context().pages().find(p => p.url() === origin + '/');
  await web.getByRole('textbox', { name: 'Filter tasks' }).fill('search');
  await expect(web.locator('article:visible')).toHaveCount(2);
  // Give the preview a little more than half the working area.
  await resizeByKeyboard(page.getByRole('separator', { name: '调整项目与工具区宽度', exact: true }), 'ArrowLeft', 5);
  assets.push(await saveStill(ctx, 'feature-browser', { address: await address.inputValue(), browserTabs: 2, visibleTasks: await web.locator('article:visible').allInnerTexts() }));
  // Current light-theme textarea uses a fixed light text color; use a supported
  // dark theme for a readable, unmodified editor/preview capture.
  await writeFile(piSettings, JSON.stringify({ ...pi, theme: 'dark' }));
  await page.evaluate(() => window.electron.theme.update('dark'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await startPi(page, 'Keep the release checklist beside the task board. Record ownership, completed checks and the remaining empty-result review.');
  await page.locator('[data-id="tool-menu"]').click(); await page.locator('[role="menuitem"][data-id="markdown"]').click();
  await page.getByRole('combobox', { name: '文稿归属', exact: true }).selectOption({ label: 'Atlas' });
  await page.getByRole('button', { name: '新建笔记', exact: true }).first().click();
  await page.getByRole('textbox', { name: '笔记标题', exact: true }).fill('Search rollout');
  await page.getByRole('textbox', { name: '笔记内容', exact: true }).fill(markdown);
  await page.getByRole('button', { name: '折叠笔记列表', exact: true }).click();
  await page.getByRole('button', { name: '分栏', exact: true }).click();
  await resizeByKeyboard(page.getByRole('separator', { name: '调整项目与工具区宽度', exact: true }), 'ArrowLeft', 9);
  await expect(page.locator('.markdown-preview')).toContainText('Release checklist');
  assets.push(await saveStill(ctx, 'feature-markdown', { scope: await page.getByRole('combobox', { name: '文稿归属', exact: true }).inputValue(),
    markdown, preview: await page.locator('.markdown-preview').innerText() }));
  await finishStills(ctx, 'tools', assets, { ...await buildEvidence(), localPreview: true, testOutput });
}); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
