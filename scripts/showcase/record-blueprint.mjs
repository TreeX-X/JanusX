// B1: browse modules, then maintain one existing Note through real host tools.
import { expect } from 'playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseNote, validateNote } from '@janus-agent/harness-core';
import { buildNoteIndex, SUPPORTED_HARNESS_PROFILE, validateModuleStructure } from '@janus-agent/harness-node';
import { blueprintModel } from './blueprint-model.mjs';
import { style } from './showcase-config.mjs';
import { prepareRepo, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, snapper, saveManifest, runRecord, sleep, AW, AH, git } from './record-lib.mjs';

const captions = {
  overview: { badge: '1', text: '从项目结构进入搜索模块' },
  module: { badge: '2', text: '预览模块，阅读现有约定' },
  before: { badge: '3', text: '在右侧对话中维护当前 Note' },
  request: { badge: '4', text: '根据实现补充搜索规则' },
  updating: { badge: '5', text: '真实读取代码与 Note，原位更新' },
  updated: { badge: '6', text: '原文刷新，保留同一篇约定' },
  diff: { badge: '6', text: '查看实际写入的修改差异' },
  result: { badge: '6', text: '对照原文，继续工作' },
};
const prompt = '核对搜索实现，把至少两个字符才筛选补进搜索约定，并查看更新后的原文。';
const answer = '已核对 `src/search.mjs`，并更新现有《搜索约定》：\n\n- 去除首尾空格后，至少两个字符才筛选。\n- 不足两个字符时显示全部任务，结果保持原顺序。\n\n原文已刷新，源码未改动。';
import { beforeDesign, afterDesign, files, authorNotes, buildEvidence } from './blueprint-fixture.mjs';

const model = await blueprintModel();
try { await runRecord(async ctx => {
  const parent = process.platform === 'win32' ? process.env.PUBLIC ?? tmpdir() : tmpdir();
  ctx.fixtureRoot = await mkdtemp(join(parent, 'janusx-blueprint-'));
  const claudeConfig = join(ctx.fixtureRoot, 'claude-config');
  const opencodeHome = join(ctx.fixtureRoot, '.config/opencode');
  await mkdir(claudeConfig); await mkdir(opencodeHome, { recursive: true });
  await writeFile(join(opencodeHome, 'opencode.json'), JSON.stringify({
    $schema: 'https://opencode.ai/config.json', theme: 'system', model: 'demo/demo', autoupdate: false,
    provider: { demo: { npm: '@ai-sdk/openai-compatible', name: 'Local demo',
      options: { apiKey: 'demo-unused', baseURL: 'http://127.0.0.1:9/v1' }, models: { demo: { name: 'Local demo' } } } },
  }));
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('blueprint', { repoParent: ctx.fixtureRoot, repoName: 'Atlas' });
  ctx.recordingRoot = recordingRoot;
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(repoPath, path)), { recursive: true });
    await writeFile(join(repoPath, path), content);
  }
  const notes = await authorNotes(repoPath);
  git(repoPath, 'add', '-A'); git(repoPath, 'commit', '-m', 'Prepare Atlas Note maintenance');
  const testOutput = execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/search.test.mjs'], { cwd: repoPath, encoding: 'utf8' });
  expect(testOutput).toContain('# pass 3');
  const { application, page } = await launchApp(ctx.fixtureRoot, claudeConfig, { env: { OPENCODE_DISABLE_AUTOUPDATE: 'true' } });
  Object.assign(ctx, { application, page });
  const host = await application.browserWindow(page);
  await host.evaluate((win, size) => { win.setContentSize(size.width, size.height); win.center(); }, { width: AW, height: AH });
  await page.evaluate(async baseURL => {
    await window.electron.experimental.update({ blueprint: true });
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
  await page.keyboard.insertText('Review the minimum search length.');
  const workspace = (await page.evaluate(() => window.electron.workspace.list())).find(w => w.name === 'Atlas');
  expect(workspace?.id).toBeTruthy();
  await page.evaluate(cwd => window.electron.harness.rescan(cwd), repoPath);
  const card = title => page.locator('.react-flow__node').filter({ has: page.locator('.bp-node-card__title', { hasText: new RegExp(`^${title}$`) }) });
  const nav = page.getByRole('navigation', { name: '模块导航' }), current = nav.locator('[aria-current="page"]');
  const detail = page.locator('.blueprint-workbench-detail-slot'), panel = page.locator('.bp-maintenance-panel');
  const frames = [], checkpoints = [], streaming = [];
  const motion = snapper(page, rawDir, frames, null,
    { motion: 4, hover: 30, click: 8, typing: 7, settleMs: 160, travelPixelsPerStep: 40 });
  async function checkpoint(stage, delay = 180) {
    await motion.rest(stage, delay);
    const point = { stage, frame: frames.length - 1, theme: await page.locator('html').getAttribute('data-theme'),
      module: await current.innerText(), nodes: await page.locator('.bp-node-card__title').allTextContents(),
      document: await detail.innerText(), panel: await panel.count() ? await panel.innerText() : '',
      tools: await panel.locator('.janus-tool-card-name').allTextContents(),
      ...(stage === 'diff' ? { writtenDiff: await panel.locator('pre[aria-label="变更后"]').innerText(),
        diffScroll: await panel.locator('pre[aria-label="变更后"]').evaluate(el => ({ top: el.scrollTop,
          height: el.clientHeight, contentHeight: el.scrollHeight })) } : {}) };
    expect(point.theme).toBe(style.theme); checkpoints.push(point); console.log(`${stage}: verified frame ${point.frame}`);
  }
  await page.mouse.move(AW - 80, AH - 45);
  await motion.snap({ x: AW - 80, y: AH - 45 }, false, 100, 'overview');
  await motion.clickSnap(page.getByRole('button', { name: /打开蓝图工作台/ }).first(), 'overview');
  await expect(current).toHaveText('Atlas');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await sleep(800); await checkpoint('overview', 200);
  await motion.clickSnap(card('任务搜索'), 'module');
  await expect(detail).toContainText('实现位于 src/search.mjs');
  await checkpoint('module', 180);
  await motion.clickSnap(card('任务搜索'), 'module', { double: true });
  await expect(current).toHaveText('任务搜索');
  await motion.clickSnap(card('搜索约定'), 'before');
  await expect(detail).toContainText('搜索在本地完成');
  await motion.clickSnap(page.locator('.blueprint-janus-capsule'), 'before');
  await expect(panel.locator('textarea')).toBeEnabled();
  await sleep(650);
  await motion.clickSnap(page.getByRole('button', { name: '适应画布', exact: true }), 'before');
  await sleep(250); await checkpoint('before', 240);
  const before = await readFile(notes.guidePath, 'utf8'), meta = parseNote(before).meta;
  model.enqueue(
    { tool: 'workspace_read', args: { workspaceId: workspace.id, path: 'src/search.mjs' } },
    { tool: 'note_read', args: { uri: notes.uri('guide') }, expectsOutput: ['needle.length < 2'] },
    { tool: 'note_scope', args: { reason: '维护搜索规则', notes: [{ uri: notes.uri('guide'), role: 'target', reason: '补充最小搜索长度' }] }, expectsOutput: ['搜索在本地完成'] },
    { tool: 'note_write', args: { reason: '同步现有实现的最小搜索长度', operations: [{ type: 'update', uri: notes.uri('guide'),
      expectedHash: createHash('sha256').update(before).digest('hex'), sections: { Design: afterDesign } }] }, expectsOutput: ['搜索在本地完成'] },
    { tool: 'note_focus', args: { reason: '查看更新后的搜索约定', action: 'locate', notes: [{ uri: notes.uri('guide'), role: 'target', reason: '已补充最小搜索长度' }] }, expectsOutput: ['applied'] },
    { text: answer },
  );
  await motion.typeSnap(panel.locator('textarea'), prompt, 'request');
  await motion.clickSnap(panel.getByRole('button', { name: '发送消息', exact: true }), 'request');
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await motion.rest('updating', 8);
    const text = await panel.innerText(), active = await panel.locator('.janus-chat-stop').count() > 0;
    streaming.push({ frame: frames.length - 1, chars: text.length, active });
    if (text.includes('原文已刷新，源码未改动。') && !active) break;
    if (text.includes('Demo model failed')) throw new Error('Demo model failed');
    await sleep(25);
  }
  await expect(panel).toContainText('原文已刷新，源码未改动。');
  await expect(panel.locator('.janus-chat-stop')).toHaveCount(0);
  await expect(panel.locator('.janus-chat-error-card')).toHaveCount(0);
  await expect(panel.locator('.janus-tool-card--failed')).toHaveCount(0);
  await expect(detail).toContainText('至少两个字符才筛选');
  await expect(current).toHaveText('任务搜索');
  await motion.clickSnap(page.getByRole('button', { name: '适应画布', exact: true }), 'updated');
  await sleep(250); await checkpoint('updated', 180);
  const changes = panel.locator('summary').filter({ hasText: /^查看修改$/ });
  await motion.clickSnap(changes, 'diff');
  const writtenDiff = panel.locator('pre[aria-label="变更后"]');
  await expect(writtenDiff).toContainText('至少两个字符才筛选');
  // Capture the browser's real smooth scroll, including the nested diff viewer.
  // No CSS, document content or tool result is altered for presentation.
  async function scrollFrames(cap) {
    for (let i = 0; i < 8; i++) { await sleep(40); await motion.rest(cap, 4); }
  }
  await writtenDiff.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await scrollFrames('diff');
  await writtenDiff.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
  await scrollFrames('diff');
  await expect(writtenDiff).toBeInViewport();
  expect(await writtenDiff.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await checkpoint('diff', 220);
  await changes.evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await scrollFrames('result');
  await motion.clickSnap(changes, 'result');
  await panel.locator('.janus-chat-messages').evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
  await scrollFrames('result');
  await expect(panel.getByText('原文已刷新，源码未改动。', { exact: true })).toBeInViewport();
  await checkpoint('result', 320);
  const posterFrame = frames.length - 1;
  const afterRaw = await readFile(notes.guidePath, 'utf8'), after = parseNote(afterRaw);
  expect(validateNote(after)).toEqual([]);
  expect(after.meta.id).toBe(meta.id); expect(after.meta.created).toBe(meta.created);
  expect(after.meta.updated).not.toBe(meta.updated);
  expect(afterRaw).toContain(afterDesign);
  for (const key of ['module', 'kind', 'lifecycle']) expect(after.meta[key]).toEqual(meta[key]);
  const index = await buildNoteIndex(repoPath);
  expect(index.entries).toHaveLength(7); expect(index.readDiagnostics).toEqual([]);
  expect(validateModuleStructure(index.entries, index.repoId)).toEqual([]);
  expect(index.entries.filter(entry => entry.note.meta.kind === 'task')).toHaveLength(0);
  for (const [path, content] of Object.entries(files)) expect(await readFile(join(repoPath, path), 'utf8')).toBe(content);
  for (const [path, content] of Object.entries(notes.originals)) if (path !== 'search/search-guide.md')
    expect(await readFile(join(repoPath, '.agents/notes', path), 'utf8')).toBe(content);
  model.verify();
  const last = frames.at(-1), first = frames[0];
  for (const opacity of [.8, .6, .4, .2, 0]) frames.push({ ...last, delay: 80, click: false, opacity, transition: 'loop-reset' });
  for (const opacity of [.2, .4, .6, .8, 1]) frames.push({ ...first, delay: 80, click: false, opacity, transition: 'loop-reset' });
  await saveManifest(recordingRoot, { captions, name: 'feature-blueprint-workbench', frames, posterFrame, createdAt: new Date().toISOString(),
    presentation: { framing: 'compact', theme: style.theme, background: style.background.asset, border: 12 },
    evidence: { ...await buildEvidence(), checkpoints, streaming, prompt, answer, workspaceId: workspace.id, calls: model.calls,
      model: 'local scripted Responses server', documents: index.entries.length, tasks: 0, before, after: afterRaw,
      preservedId: after.meta.id, created: after.meta.created, updatedBefore: meta.updated, updatedAfter: after.meta.updated,
      fixtureTests: 3, testOutput, sourceUnchanged: true, otherNotesUnchanged: true, promptsSubmitted: 1,
      accountsCopied: false, loopTransitionMs: 800 } });
}); } finally { await model.close(); }
