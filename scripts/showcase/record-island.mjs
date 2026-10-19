// Island conversation: two turns, real workspace reads, scripted local streaming.
import { expect } from 'playwright/test';
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { islandModel } from './island-model.mjs';
import { style } from './showcase-config.mjs';
import { prepareRepo, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, snapper, saveManifest, runRecord, sleep, AW, AH, git } from './record-lib.mjs';

const captions = {
  ready: { badge: '1', text: '从胶囊进入 Island' },
  context: { badge: '2', text: '附加当前项目上下文' },
  question: { badge: '3', text: '询问搜索入口，读取真实代码' },
  answer: { badge: '4', text: '查看读取详情与流式回答' },
  followup: { badge: '5', text: '继续追问修改与验证方式' },
  result: { badge: '6', text: '保留上下文，得到可执行的建议' },
};
const prompts = ['这个项目的搜索入口在哪里？', '要加空结果提示，需要改哪里、怎么验证？'];
const answers = [
  '搜索入口在 `src/main.mjs`，筛选实现在 `src/search.mjs` 的 `filterTasks`。\n\n输入先去除首尾空格，再忽略大小写匹配任务标题；结果保留原顺序。',
  '修改 `src/main.mjs` 的展示层，保留 `filterTasks` 的筛选逻辑。\n\n- 无匹配时保留搜索词，显示“没有匹配任务”。\n- 在 `tests/search.test.mjs` 补充空结果与清空搜索用例。\n- 运行 `npm test`，再手动检查筛选与提示。\n\n以上是修改建议，尚未改动文件。',
];
const files = {
  'package.json': JSON.stringify({ name: 'atlas', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n',
  'README.md': '# Atlas\n\nTask board with local title search.\n\nEntry: src/main.mjs\nSearch: src/search.mjs\nValidation: npm test\n',
  'src/main.mjs': "import { filterTasks } from './search.mjs';\n\nexport function renderTasks(root, tasks, query) {\n  const visible = filterTasks(tasks, query);\n  root.replaceChildren(...visible.map(task => {\n    const item = document.createElement('li');\n    item.textContent = task.title;\n    return item;\n  }));\n}\n",
  'src/search.mjs': "export function filterTasks(tasks, query) {\n  const needle = query.trim().toLowerCase();\n  return tasks.filter(task => task.title.toLowerCase().includes(needle));\n}\n",
  'tests/search.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { filterTasks } from '../src/search.mjs';\n\nconst tasks = [{ title: 'Search tasks' }, { title: 'Release checklist' }, { title: 'Search empty state' }];\ntest('matches titles without case sensitivity', () => {\n  assert.equal(filterTasks(tasks, 'SEARCH').length, 2);\n});\ntest('trims the query', () => {\n  assert.equal(filterTasks(tasks, ' search ').length, 2);\n});\ntest('preserves task order', () => {\n  assert.deepEqual(filterTasks(tasks, 'search'), [tasks[0], tasks[2]]);\n});\n",
};

async function sourceEvidence() {
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
  ctx.fixtureRoot = await mkdtemp(join(parent, 'janusx-island-'));
  const claudeConfig = join(ctx.fixtureRoot, 'claude-config');
  const opencodeHome = join(ctx.fixtureRoot, '.config/opencode');
  await mkdir(claudeConfig); await mkdir(opencodeHome, { recursive: true });
  await writeFile(join(opencodeHome, 'opencode.json'), JSON.stringify({
    $schema: 'https://opencode.ai/config.json', theme: 'system', model: 'demo/demo', autoupdate: false,
    provider: { demo: { npm: '@ai-sdk/openai-compatible', name: 'Local demo',
      options: { apiKey: 'demo-unused', baseURL: 'http://127.0.0.1:9/v1' }, models: { demo: { name: 'Local demo' } } } },
  }));
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('island', { repoParent: ctx.fixtureRoot, repoName: 'Atlas' });
  ctx.recordingRoot = recordingRoot;
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(repoPath, path)), { recursive: true });
    await writeFile(join(repoPath, path), content);
  }
  git(repoPath, 'add', '-A'); git(repoPath, 'commit', '-m', 'Prepare Atlas search conversation');
  const fixtureTests = execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/search.test.mjs'], { cwd: repoPath, encoding: 'utf8' });
  expect(fixtureTests).toContain('# pass 3');
  const { application, page } = await launchApp(ctx.fixtureRoot, claudeConfig,
    { env: { OPENCODE_DISABLE_AUTOUPDATE: 'true' } });
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
  await page.keyboard.insertText('Add an empty state to task search.');
  const workspaces = await page.evaluate(() => window.electron.workspace.list());
  const workspace = workspaces.find(w => w.name === 'Atlas');
  expect(workspace?.id).toBeTruthy();
  const island = page.locator('.janus-island');
  const shell = page.locator('.janus-island-shell');
  const chat = shell.locator('.janus-chat-view:not(.janus-chat-view--hidden) .janus-chat');
  const frames = [], checkpoints = [], streaming = [];
  const motion = snapper(page, rawDir, frames, null,
    { motion: 4, hover: 30, click: 8, typing: 7, settleMs: 140, travelPixelsPerStep: 40 });
  const park = { x: AW - 80, y: AH - 45 };
  await page.mouse.move(park.x, park.y); await motion.snap(park, false, 150, 'ready');
  await motion.clickSnap(island, 'ready', { double: true });
  for (let i = 0; i < 5; i++) { await sleep(40); await motion.rest('ready', 4); }
  await expect(shell).toHaveAttribute('data-stage', 'expanded');
  await motion.clickSnap(shell.locator('[data-view="chat"]').first(), 'context');
  await expect(chat).toBeVisible();
  await motion.clickSnap(chat.getByRole('button', { name: '新建对话', exact: true }), 'context');
  await motion.clickSnap(chat.getByRole('button', { name: '收起会话列表', exact: true }), 'context');
  await motion.clickSnap(chat.getByRole('button', { name: '附加工作区', exact: true }), 'context');
  await motion.clickSnap(page.getByRole('option', { name: 'Atlas', exact: true }), 'context');
  await expect(chat.locator('.janus-resource-chip')).toHaveText('Atlas');
  async function checkpoint(stage, delay = 150) {
    await motion.rest(stage, delay);
    const snapshot = { stage, frame: frames.length - 1, theme: await page.locator('html').getAttribute('data-theme'),
      resources: await chat.locator('.janus-resource-label').allTextContents(),
      users: await chat.locator('.janus-chat-message.user').count(),
      tools: await chat.locator('.janus-tool-card-name').allTextContents(),
      text: await chat.locator('.janus-chat-messages').innerText() };
    expect(snapshot.theme).toBe(style.theme); expect(snapshot.resources).toEqual(['Atlas']);
    expect(snapshot.users).toBe(checkpoints.length);
    expect(await chat.locator('.janus-chat-error-card').count()).toBe(0);
    checkpoints.push(snapshot); console.log(`${stage}: verified frame ${snapshot.frame}`);
  }
  await checkpoint('context', 100);
  async function captureTurn(stage, text) {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      await motion.rest(stage, 8);
      const content = await chat.locator('.janus-chat-messages').innerText();
      streaming.push({ frame: frames.length - 1, stage, chars: content.length,
        active: await chat.locator('.janus-chat-stop').count() > 0 });
      if (content.includes(text) && await chat.locator('.janus-chat-stop').count() === 0) return;
      if (await chat.locator('.janus-chat-error-card').count())
        throw new Error(await chat.locator('.janus-chat-error-card').innerText());
      await sleep(25);
    }
    throw new Error(`Conversation did not finish: ${stage}`);
  }
  const composer = chat.locator('textarea.janus-chat-input');
  model.enqueue(
    { tool: 'workspace_read', args: { workspaceId: workspace.id, path: 'src/main.mjs' } },
    { tool: 'workspace_read', args: { workspaceId: workspace.id, path: 'src/search.mjs' }, expectsOutput: ['root.replaceChildren'] },
    { text: answers[0], expectsOutput: ['query.trim().toLowerCase()'] },
  );
  await motion.typeSnap(composer, prompts[0], 'question');
  await motion.clickSnap(chat.getByRole('button', { name: '发送消息', exact: true }), 'question');
  await captureTurn('answer', '结果保留原顺序。');
  await expect(chat.locator('.janus-tool-card--completed')).toHaveCount(2);
  await checkpoint('answer', 210);
  const searchRead = chat.locator('.janus-tool-card').nth(1);
  await motion.clickSnap(searchRead.locator('.janus-tool-card-toggle'), 'answer');
  await expect(searchRead.locator('.janus-tool-card-body')).toContainText('src/search.mjs');
  await motion.rest('answer', 210);
  const toolDetail = { frame: frames.length - 1, text: await searchRead.locator('.janus-tool-card-body').innerText() };
  await motion.clickSnap(searchRead.locator('.janus-tool-card-toggle'), 'answer');
  model.enqueue(
    { tool: 'workspace_read', args: { workspaceId: workspace.id, path: 'tests/search.test.mjs' },
      expectsHistory: [prompts[0], prompts[1], '结果保留原顺序'] },
    { tool: 'workspace_read', args: { workspaceId: workspace.id, path: 'package.json' }, expectsOutput: ['preserves task order'] },
    { text: answers[1], expectsOutput: ['node --test'] },
  );
  await motion.typeSnap(composer, prompts[1], 'followup');
  await motion.clickSnap(chat.getByRole('button', { name: '发送消息', exact: true }), 'followup');
  await captureTurn('result', '以上是修改建议，尚未改动文件。');
  await expect(chat.locator('.janus-tool-card--completed')).toHaveCount(4);
  await checkpoint('result', 300);
  const posterFrame = frames.length - 1;
  expect(streaming.filter(s => s.active).length).toBeGreaterThan(10);
  expect(new Set(streaming.filter(s => s.active).map(s => s.chars)).size).toBeGreaterThan(8);
  for (const [path, content] of Object.entries(files)) expect(await readFile(join(repoPath, path), 'utf8')).toBe(content);
  model.verify();
  const last = frames.at(-1), first = frames[0];
  for (const opacity of [.8, .6, .4, .2, 0]) frames.push({ ...last, delay: 80, click: false, opacity, transition: 'loop-reset' });
  for (const opacity of [.2, .4, .6, .8, 1]) frames.push({ ...first, delay: 80, click: false, opacity, transition: 'loop-reset' });
  await saveManifest(recordingRoot, { name: 'feature-island-chat', captions, frames, posterFrame, createdAt: new Date().toISOString(),
    presentation: { framing: 'compact', theme: style.theme, background: style.background.asset, border: 12 },
    evidence: { ...await sourceEvidence(), checkpoints, streaming, prompts, answers, toolDetail, workspaceId: workspace.id,
      model: 'local scripted Responses server', calls: model.calls, promptsSubmitted: 2, accountsCopied: false,
      sourceUnchanged: true, fixtureTests: 3, loopTransitionMs: 800 } });
}); } finally { await model.close(); }
