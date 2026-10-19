// Real Git scheduler -> evidence tools -> suggestion handoff -> restricted write -> host review.
import { expect } from 'playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseNote } from '@janus-agent/harness-core';
import { files, authorNotes, buildEvidence } from './blueprint-fixture.mjs';
import { islandModel } from './island-model.mjs';
import { style } from './showcase-config.mjs';
import { prepareRepo, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded, openWorkspace,
  snapper, saveManifest, runRecord, sleep, AW, AH, git } from './record-lib.mjs';

const captions = Object.fromEntries(['ready', 'commit', 'reviewing', 'finding', 'repair', 'recheck', 'result', 'diff'].map(key => [key, { text: key }]));
const wrong = '当前实现从一个字符开始筛选，忽略大小写，保持任务顺序。';
const correct = '当前实现去除首尾空格后，从两个字符开始筛选；不足两个字符时显示全部任务。匹配忽略大小写，保持任务顺序。';
const summary = '最小搜索长度与当前实现不一致';
const model = await islandModel();
try { await runRecord(async ctx => {
  ctx.fixtureRoot = await mkdtemp(join(process.env.PUBLIC ?? tmpdir(), 'janusx-review-'));
  const claudeConfig = join(ctx.fixtureRoot, 'claude-config'); await mkdir(claudeConfig);
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('review', { repoParent: ctx.fixtureRoot, repoName: 'Atlas' });
  ctx.recordingRoot = recordingRoot;
  for (const [path, content] of Object.entries(files)) { await mkdir(dirname(join(repoPath, path)), { recursive: true }); await writeFile(join(repoPath, path), content); }
  const notes = await authorNotes(repoPath);
  notes.guidePath = join(repoPath, '.agents/notes/search/local-filter.md');
  git(repoPath, 'add', '-A'); git(repoPath, 'commit', '-m', 'Prepare Atlas review baseline');
  const baseline = git(repoPath, 'rev-parse', 'HEAD').trim();
  const { application, page } = await launchApp(ctx.fixtureRoot, claudeConfig); Object.assign(ctx, { application, page });
  const host = await application.browserWindow(page);
  await host.evaluate((win, size) => win.setContentSize(size.width, size.height), { width: AW, height: AH });
  await page.evaluate(async baseURL => {
    await window.electron.experimental.update({ blueprint: true });
    await window.electron.llm.saveTerminalProvider('janus', { id: 'openai-compatible', name: '演示：每次提交检查',
      authType: 'api-key', enabled: true, apiKey: 'local-only', baseURL, modelId: 'atlas-demo', models: ['atlas-demo'],
      extra: { protocol: 'responses', chatModelLimits: { 'atlas-demo': { contextWindow: 64000, maxOutputTokens: 8192 } } } });
    await window.electron.llm.setTerminalDefault('janus', 'openai-compatible');
  }, model.baseURL);
  await skipGate(page); await ensureWorkspace(page, 'Atlas', repoPath); await ensureSidebarExpanded(page); await openWorkspace(page, 'Atlas');
  await page.getByRole('main').getByRole('button', { name: 'OpenCode', exact: true }).click();
  await expect.poll(() => page.locator('.xterm-rows:visible').innerText(), { timeout: 90000 }).toMatch(/tab agents|ctrl\+p commands/);
  await page.evaluate(async root => {
    await window.electron.harness.rescan(root);
    await window.electron.blueprintReview.read(root);
    const settings = await window.electron.blueprintReview.settingsGet();
    await window.electron.blueprintReview.settingsUpdate({ ...settings, generation: { providerId: 'openai-compatible', modelId: 'atlas-demo' }, automatic: { enabled: true, commits: 1 } });
  }, repoPath);
  await expect.poll(async () => (await page.evaluate(root => window.electron.blueprintReview.activityRead(root), repoPath)).automatic?.phase).toBe('waiting');
  const clean = await readFile(notes.guidePath, 'utf8');
  const before = clean.replace('使用本地标题匹配，保持原有任务顺序。', `${wrong}\n\n实现：src/search.mjs`);
  await writeFile(notes.guidePath, before);
  await page.evaluate(root => window.electron.harness.rescan(root), repoPath);
  const guidePath = '.agents/notes/search/local-filter.md';
  const finding = { id: randomUUID(), category: 'contradiction', summary,
    explanation: '约定写明从一个字符筛选，但实现对不足两个字符直接返回全部任务。',
    suggestion: '保留现有实现，将文档同步为去除首尾空格后至少两个字符才筛选。',
    citations: [{ path: guidePath, quote: wrong }, { path: 'src/search.mjs', quote: 'if (needle.length < 2) return tasks;' }], verification: 'not-configured' };
  model.enqueue({ tool: 'review.read', args: { path: guidePath } },
    { tool: 'review.read', args: { path: 'src/search.mjs' }, expectsOutput: [wrong] },
    { text: JSON.stringify({ findings: [finding], coverage: 'complete', limitations: [] }), chunkSize: 90, interval: 25, expectsOutput: ['needle.length < 2'] });
  const frames = [], checkpoints = [], events = [];
  await page.evaluate(() => { window.__reviewEvents = []; window.electron.blueprintReview.onActivityChanged(update => window.__reviewEvents.push(update)); });
  const motion = snapper(page, rawDir, frames, null, { motion: 4, hover: 25, click: 8, typing: 6, settleMs: 160, travelPixelsPerStep: 40 });
  async function point(stage, delay = 190) { await motion.rest(stage, delay); checkpoints.push({ stage, frame: frames.length - 1,
    text: await page.locator('body').innerText(), view: await page.evaluate(root => window.electron.blueprintReview.read(root), repoPath) }); console.log(stage, frames.length - 1); }
  await page.mouse.move(AW - 65, AH - 45); await motion.snap({ x: AW - 65, y: AH - 45 }, false, 160, 'ready');
  // The built-in Git panel submits the real changed Note, without a Shell terminal.
  const gitButton = page.getByRole('button', { name: /Git/ }).first();
  await motion.clickSnap(gitButton, 'ready');
  await point('ready');
  await motion.clickSnap(page.getByRole('button', { name: '全部暂存', exact: true }), 'commit');
  await motion.typeSnap(page.getByPlaceholder('提交消息...'), 'demo(N=1): check each commit', 'commit');
  await motion.clickSnap(page.getByRole('button', { name: '提交', exact: true }), 'commit');
  const commit = git(repoPath, 'rev-parse', 'HEAD').trim(); expect(commit).not.toBe(baseline);
  await motion.clickSnap(page.getByRole('button', { name: /打开蓝图工作台/ }).first(), 'reviewing');
  const nav = page.getByRole('navigation', { name: '模块导航' });
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Atlas');
  const deadline = Date.now() + 60_000;
  let reviewed;
  while (Date.now() < deadline) {
    await motion.rest('reviewing', 10); await sleep(60);
    reviewed = await page.evaluate(root => window.electron.blueprintReview.readSaved(root), repoPath);
    if (reviewed.items.some(item => item.report?.findings.length)) break;
  }
  expect(reviewed.items.find(item => item.report?.findings.length)?.report?.provenance.commit).toBe(commit);
  await point('reviewing', 160);
  await motion.clickSnap(page.getByRole('button', { name: /^有建议/ }), 'finding');
  await motion.clickSnap(page.getByRole('button', { name: summary, exact: true }), 'finding');
  const detail = page.locator('.blueprint-workbench-detail-slot');
  await expect(detail).toContainText(wrong); await expect(detail).toContainText(summary);
  await motion.clickSnap(page.getByRole('button', { name: '关闭列表', exact: true }), 'finding');
  const findingDetails = detail.locator('details[data-finding-id]');
  if (await findingDetails.getAttribute('open') === null)
    await motion.clickSnap(findingDetails.locator('summary'), 'finding');
  const codeQuote = findingDetails.locator('blockquote').last();
  await codeQuote.evaluate(el => {
    let pane = el.parentElement;
    while (pane && !(pane.scrollHeight > pane.clientHeight && /^(auto|scroll)$/.test(getComputedStyle(pane).overflowY))) pane = pane.parentElement;
    if (!pane) throw new Error('Finding has no scrollable evidence pane');
    pane.scrollTo({ top: pane.scrollTop + el.getBoundingClientRect().top - pane.getBoundingClientRect().top - (pane.clientHeight - el.clientHeight) / 2, behavior: 'smooth' });
  });
  for (let i = 0; i < 8; i++) { await sleep(40); await motion.rest('finding', 5); }
  await expect(codeQuote).toBeInViewport();
  await motion.clickSnap(page.getByRole('button', { name: '适应画布', exact: true }), 'finding');
  await point('finding', 250);
  const workspace = (await page.evaluate(() => window.electron.workspace.list())).find(w => w.name === 'Atlas');
  const hash = createHash('sha256').update(before).digest('hex');
  const after = before.replace(wrong, correct);
  model.enqueue({ tool: 'note.repair_read', args: {} },
    { tool: 'workspace_read', args: { workspaceId: workspace.id, path: 'src/search.mjs' }, expectsOutput: [wrong] },
    { tool: 'note.repair_write', args: { markdown: after, expectedHash: hash, reason: '同步文档描述与现有搜索实现' }, expectsOutput: ['needle.length < 2'] },
    { text: '已将约定同步为至少两个字符才筛选。接下来由宿主独立复审。', interval: 65 },
    { tool: 'review.read', args: { path: guidePath } },
    { tool: 'review.read', args: { path: 'src/search.mjs' }, expectsOutput: [correct] },
    { text: JSON.stringify({ findings: [], coverage: 'complete', limitations: [] }), chunkSize: 70, interval: 25, expectsOutput: ['needle.length < 2'] });
  const repairButton = detail.getByRole('button', { name: '修复本篇 · 1 条建议', exact: true }).first();
  await repairButton.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  for (let i = 0; i < 8; i++) { await sleep(40); await motion.rest('repair', 5); }
  await motion.clickSnap(repairButton, 'repair');
  const card = page.locator('.bp-note-repair').filter({ has: page.locator('.bp-note-repair__summary') });
  const repairDeadline = Date.now() + 75_000;
  while (Date.now() < repairDeadline) {
    const phase = await card.getAttribute('data-phase'); events.push({ frame: frames.length, phase });
    await motion.rest(phase === 'reviewing' ? 'recheck' : 'repair', 9); await sleep(35);
    if (phase === 'resolved') break;
    if (['failed', 'review-incomplete', 'unresolved'].includes(phase)) throw new Error(await card.innerText());
  }
  await expect(card).toHaveAttribute('data-phase', 'resolved');
  await expect(detail).toContainText(correct);
  const finalView = await page.evaluate(root => window.electron.blueprintReview.read(root), repoPath);
  const final = finalView.items.find(item => item.noteId === parseNote(before).meta.id);
  expect(final.report.coverage).toBe('complete'); expect(final.report.findings).toEqual([]);
  const written = await readFile(notes.guidePath, 'utf8'); expect(written).toContain(correct);
  expect(parseNote(written).meta.id).toBe(parseNote(before).meta.id);
  await motion.clickSnap(page.getByRole('button', { name: '适应画布', exact: true }), 'result');
  await sleep(300);
  await point('result', 270); const posterFrame = frames.length - 1;
  await motion.clickSnap(card.getByRole('button', { name: '查看修改', exact: true }), 'diff');
  await point('diff', 240);
  model.verify();
  const last = frames.at(-1), first = frames[0];
  for (const opacity of [.8,.6,.4,.2,0]) frames.push({ ...last, delay: 80, click: false, opacity, transition: 'loop-reset' });
  for (const opacity of [.2,.4,.6,.8,1]) frames.push({ ...first, delay: 80, click: false, opacity, transition: 'loop-reset' });
  await saveManifest(recordingRoot, { name: 'feature-blueprint-review', frames, captions, posterFrame, createdAt: new Date().toISOString(),
    presentation: { framing: 'compact', theme: style.theme, background: style.background.asset, border: 12 },
    evidence: { ...await buildEvidence(), checkpoints, events, activityEvents: await page.evaluate(() => window.__reviewEvents),
      calls: model.calls, before, after: written, baseline, commit, final, automatic: { enabled: true, commits: 1 },
      model: 'local scripted Responses server', accountsCopied: false, promptsSubmitted: 0, loopTransitionMs: 800 } });
}); } finally { await model.close(); }
