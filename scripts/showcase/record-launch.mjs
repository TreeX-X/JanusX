// L: real launch-config tools, approval, disk write, tests and user-started server.
import { expect } from 'playwright/test';
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { islandModel } from './island-model.mjs';
import { style } from './showcase-config.mjs';
import { prepareRepo, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, snapper, saveManifest, runRecord, sleep, AW, AH, git } from './record-lib.mjs';

const captions = Object.fromEntries([
  ['ready', '打开项目运行配置'], ['request', '描述需要的开发与测试配置'],
  ['draft', '读取项目，生成配置草稿'], ['approval', '检查命令，批准写入'],
  ['saved', '配置落盘，等待用户操作'], ['test', '点击测试，检查真实结果'],
  ['running', '点击启动，服务开始运行'],
].map(([key, text], i) => [key, { badge: String(i + 1), text }]));
const prompt = '根据项目 scripts 生成开发服务和测试配置，保存前让我确认。';
const answer = '已保存开发与测试配置。\n\n- 开发服务：`npm run dev`\n- 测试：`npm run test`\n\n点击下方“测试”验证，再点“启动”运行开发服务。';
const files = {
  'package.json': JSON.stringify({ name: 'atlas', private: true, type: 'module',
    scripts: { dev: 'node src/server.mjs', test: 'node --test' } }, null, 2) + '\n',
  'README.md': '# Atlas\n\nLocal task board.\n\nDevelopment: npm run dev\nTests: npm run test\nThe server reads PORT from its environment.\n',
  'src/tasks.mjs': "export const tasks = ['Search tasks', 'Search empty state', 'Release checklist'];\nexport const search = query => tasks.filter(title => title.toLowerCase().includes(query.trim().toLowerCase()));\n",
  'src/server.mjs': "import { createServer } from 'node:http';\nimport { tasks } from './tasks.mjs';\nconst server = createServer((req, res) => {\n  res.setHeader('content-type', 'application/json');\n  res.end(JSON.stringify({ name: 'Atlas', tasks }));\n});\nserver.listen(Number(process.env.PORT || 4317), '127.0.0.1', () => {\n  console.log(`Atlas ready at http://127.0.0.1:${server.address().port}`);\n});\n",
  'tests/tasks.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { search, tasks } from '../src/tasks.mjs';\ntest('matches titles without case sensitivity', () => assert.equal(search('SEARCH').length, 2));\ntest('trims the query', () => assert.equal(search(' search ').length, 2));\ntest('preserves task order', () => assert.deepEqual(search('search'), tasks.slice(0, 2)));\n",
};

async function freePort() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function buildEvidence() {
  const entry = resolve(process.env.SHOWCASE_ENTRY ?? 'out/main/index.js');
  const root = dirname(dirname(entry)), hash = createHash('sha256');
  async function visit(dir) {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, item.name);
      if (item.isDirectory()) await visit(path);
      else { hash.update(path.slice(root.length)); hash.update(await readFile(path)); }
    }
  }
  await visit(root);
  return { entry, buildSha256: hash.digest('hex'), recordingHead: git(resolve('.'), 'rev-parse', 'HEAD').trim(),
    buildSourcesPinned: false, workingTreeDirty: Boolean(git(resolve('.'), 'status', '--porcelain').trim()) };
}

const model = await islandModel();
try { await runRecord(async ctx => {
  const parent = process.platform === 'win32' ? process.env.PUBLIC ?? tmpdir() : tmpdir();
  ctx.fixtureRoot = await mkdtemp(join(parent, 'janusx-launch-'));
  const claudeConfig = join(ctx.fixtureRoot, 'claude-config');
  const opencodeHome = join(ctx.fixtureRoot, '.config/opencode');
  await mkdir(claudeConfig); await mkdir(opencodeHome, { recursive: true });
  await writeFile(join(opencodeHome, 'opencode.json'), JSON.stringify({
    $schema: 'https://opencode.ai/config.json', theme: 'system', model: 'demo/demo', autoupdate: false,
    provider: { demo: { npm: '@ai-sdk/openai-compatible', name: 'Local demo',
      options: { apiKey: 'demo-unused', baseURL: 'http://127.0.0.1:9/v1' }, models: { demo: { name: 'Local demo' } } } },
  }));
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('launch', { repoParent: ctx.fixtureRoot, repoName: 'Atlas' });
  ctx.recordingRoot = recordingRoot;
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(repoPath, path)), { recursive: true });
    await writeFile(join(repoPath, path), content);
  }
  git(repoPath, 'add', '-A'); git(repoPath, 'commit', '-m', 'Prepare Atlas launch demo');
  const port = await freePort();
  const config = { version: '0.1.0', projectType: 'custom', projectName: 'Atlas', configurations: [
    { name: 'dev', type: 'custom', request: 'launch', program: 'npm', args: ['run', 'dev'], port, env: { PORT: String(port) } },
    { name: 'test', type: 'custom', request: 'launch', program: 'npm', args: ['run', 'test'] },
  ] };
  const { application, page } = await launchApp(ctx.fixtureRoot, claudeConfig,
    { env: { OPENCODE_DISABLE_AUTOUPDATE: 'true', NO_COLOR: '1', FORCE_COLOR: undefined } });
  Object.assign(ctx, { application, page });
  const host = await application.browserWindow(page);
  await host.evaluate((win, size) => { win.setContentSize(size.width, size.height); win.center(); }, { width: AW, height: AH });
  await page.evaluate(async baseURL => {
    const saved = await window.electron.llm.saveTerminalProvider('janus', { id: 'openai-compatible', name: '本地脚本演示',
      authType: 'api-key', enabled: true, apiKey: 'demo-local-only', baseURL, modelId: 'atlas-demo', models: ['atlas-demo'],
      extra: { protocol: 'responses', chatModelLimits: { 'atlas-demo': { contextWindow: 64000, maxOutputTokens: 8192 } } } });
    if (!saved.success) throw new Error('Demo provider setup failed');
    await window.electron.llm.setTerminalDefault('janus', 'openai-compatible');
  }, model.baseURL);
  await skipGate(page);
  const learning = page.getByRole('dialog').filter({ hasText: '首次入门' });
  if (await learning.count()) await learning.getByRole('button', { name: '关闭', exact: true }).click();
  await ensureWorkspace(page, 'Atlas', repoPath); await ensureSidebarExpanded(page); await openWorkspace(page, 'Atlas');
  await page.getByRole('main').getByRole('button', { name: 'OpenCode', exact: true }).click();
  await expect.poll(() => page.locator('.xterm-rows:visible').innerText(), { timeout: 90_000 }).toMatch(/tab agents|ctrl\+p commands/);
  await page.locator('.xterm-helper-textarea:visible').focus();
  await page.keyboard.insertText('Review the task board development setup.');
  const workspace = (await page.evaluate(() => window.electron.workspace.list())).find(w => w.name === 'Atlas');
  expect(workspace?.id).toBeTruthy();
  const frames = [], checkpoints = [], streaming = [];
  const motion = snapper(page, rawDir, frames, null,
    { motion: 4, hover: 30, click: 8, typing: 7, settleMs: 140, travelPixelsPerStep: 40 });
  await page.mouse.move(AW - 80, AH - 45);
  await motion.snap({ x: AW - 80, y: AH - 45 }, false, 100, 'ready');
  const row = page.locator('.workspace-sidebar .ws').filter({ hasText: 'Atlas' }).first();
  await row.hover();
  await motion.clickSnap(row.getByRole('button', { name: '更多操作' }), 'ready');
  await motion.clickSnap(page.getByRole('button', { name: '运行配置…', exact: true }), 'ready');
  const modal = page.locator('.ws-config-modal');
  const assistant = modal.getByRole('complementary', { name: 'Janus workspace launch assistant' });
  const composer = assistant.locator('textarea');
  await expect(composer).toBeEnabled();
  async function checkpoint(stage, delay = 150) {
    await motion.rest(stage, delay);
    const point = { stage, frame: frames.length - 1, theme: await page.locator('html').getAttribute('data-theme'),
      text: await modal.innerText(), tools: await assistant.locator('.janus-tool-card-name').allTextContents(),
      draft: await assistant.locator('[data-config-state="draft"]').count(),
      applied: await assistant.locator('[data-config-state="applied"]').count() };
    expect(point.theme).toBe(style.theme);
    checkpoints.push(point); console.log(`${stage}: verified frame ${point.frame}`);
  }
  await checkpoint('ready', 120);
  model.enqueue(
    { tool: 'workspace_read', args: { workspaceId: workspace.id, path: 'package.json' } },
    { tool: 'workspace_read', args: { workspaceId: workspace.id, path: 'src/server.mjs' }, expectsOutput: ['node --test'] },
    { tool: 'launch_config_get', args: {}, expectsOutput: ['process.env.PORT'] },
    { tool: 'launch_config_edit', args: { config }, expectsOutput: ['draft read'] },
    { tool: 'launch_config_apply', args: {}, expectsOutput: ['replace full config'] },
    { text: answer, expectsOutput: ['written .janusX/janusX.launch.json'] },
  );
  await motion.typeSnap(composer, prompt, 'request');
  await motion.clickSnap(assistant.getByTitle('发送', { exact: true }), 'request');
  async function captureUntil(stage, ready) {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      await motion.rest(stage, 8);
      streaming.push({ frame: frames.length - 1, stage, chars: (await assistant.innerText()).length,
        active: await assistant.locator('[data-mode="stop"]').count() > 0 });
      if (await ready()) return;
      if ((await assistant.innerText()).includes('Demo model failed')) throw new Error('Demo model failed');
      await sleep(25);
    }
    throw new Error(`Launch UI did not settle: ${stage}`);
  }
  await captureUntil('draft', () => modal.getByText('Janus 请求写入运行配置', { exact: true }).isVisible());
  const configPath = join(repoPath, '.janusX/janusX.launch.json');
  expect(await readFile(configPath, 'utf8').catch(() => null)).toBeNull();
  await expect(modal.locator('[aria-label="Project configuration changes"]')).toContainText('npm');
  await checkpoint('approval', 240);
  await motion.clickSnap(modal.getByRole('button', { name: '快速配置', exact: true }), 'approval');
  await motion.rest('approval', 140);
  await motion.clickSnap(modal.getByRole('button', { name: 'test', exact: true }), 'approval');
  await motion.rest('approval', 140);
  await motion.clickSnap(modal.getByRole('button', { name: 'dev', exact: true }), 'approval');
  await motion.clickSnap(modal.getByRole('button', { name: '批准', exact: true }), 'approval');
  await expect(modal.getByText('Janus 请求写入运行配置', { exact: true })).toBeHidden();
  await captureUntil('saved', async () => (await assistant.innerText()).includes('运行开发服务。')
    && await assistant.locator('[data-mode="stop"]').count() === 0);
  const landed = JSON.parse(await readFile(configPath, 'utf8'));
  expect(landed.configurations).toEqual(config.configurations);
  await expect(assistant.locator('[data-config-state="applied"]')).toHaveCount(1);
  await checkpoint('saved', 180);
  await motion.clickSnap(modal.getByTitle('运行 test', { exact: true }), 'test');
  await captureUntil('test', () => modal.locator('[data-success="true"]').isVisible());
  await motion.clickSnap(modal.locator('details summary'), 'test');
  await expect(modal.locator('details pre')).toContainText('preserves task order');
  await checkpoint('test', 230);
  const testOutput = await modal.locator('details pre').innerText();
  expect(testOutput).toMatch(/pass\s+3/);
  await motion.clickSnap(modal.getByTitle('启动当前配置', { exact: true }), 'running');
  await expect(modal).toContainText('1 个进程运行中');
  const url = `http://127.0.0.1:${port}`;
  await expect.poll(async () => { try { return (await fetch(url)).ok; } catch { return false; } }).toBe(true);
  const httpResult = await (await fetch(url)).json();
  expect(httpResult).toEqual({ name: 'Atlas', tasks: ['Search tasks', 'Search empty state', 'Release checklist'] });
  const running = await page.evaluate(() => window.electron.project.list());
  expect(running.success).toBe(true); expect(running.data).toHaveLength(1);
  const detail = await page.evaluate(id => window.electron.project.get(id), running.data[0].id);
  expect(detail.data.output.join('\n')).toContain(`Atlas ready at ${url}`);
  await expect(assistant.locator('.janus-tool-card--completed')).toHaveCount(5);
  await expect(assistant.locator('.janus-tool-card--failed')).toHaveCount(0);
  await checkpoint('running', 300);
  const posterFrame = frames.length - 1;
  // Stop through the same user toolbar after the captured outcome, then verify cleanup.
  await modal.getByTitle('停止当前工作区进程', { exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.electron.project.list())).data.length).toBe(0);
  for (const [path, content] of Object.entries(files)) expect(await readFile(join(repoPath, path), 'utf8')).toBe(content);
  model.verify();
  const last = frames.at(-1), first = frames[0];
  for (const opacity of [.8, .6, .4, .2, 0]) frames.push({ ...last, delay: 80, click: false, opacity, transition: 'loop-reset' });
  for (const opacity of [.2, .4, .6, .8, 1]) frames.push({ ...first, delay: 80, click: false, opacity, transition: 'loop-reset' });
  await saveManifest(recordingRoot, { name: 'feature-run-config', captions, frames, posterFrame, createdAt: new Date().toISOString(),
    presentation: { framing: 'compact', theme: style.theme, background: style.background.asset, border: 12 },
    evidence: { ...await buildEvidence(), checkpoints, streaming, prompt, answer, config: landed, testOutput,
      httpResult, running: running.data, processOutput: detail.data.output, workspaceId: workspace.id,
      model: 'local scripted Responses server', calls: model.calls, promptsSubmitted: 1,
      accountsCopied: false, sourceUnchanged: true, approvedBeforeWrite: true, stoppedAfterCapture: true, loopTransitionMs: 800 } });
}); } finally { await model.close(); }
