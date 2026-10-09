// Note: asserted current-source recording — see .agents/notes/desktop/readme-showcase.md
import { expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseNote, validateNote } from '@janus-agent/harness-core';
import { buildNoteIndex, SUPPORTED_HARNESS_PROFILE, validateModuleStructure } from '@janus-agent/harness-node';
import { blueprintModel } from './blueprint-model.mjs';
import { prepareRepo, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded, openWorkspace, snapper, saveManifest, runRecord, git } from './record-lib.mjs';

const captions = {
  'bp-1': { badge: '1', text: '根模块页 · 文档与子模块同层共存' },
  'bp-2': { badge: '2', text: '单击预览 · 双击进入，保留当前父节点' },
  'bp-3': { badge: '3', text: '进入子模块 · 文件按类型分组，逐层返回' },
  'bp-4': { badge: '4', text: '跨模块关注与定位 · 本地脚本模型驱动真实工具' },
  'bp-5': { badge: '5', text: 'xdo 原位维护同一 Note · 刷新 updated，不新建 Task' },
  'bp-6': { badge: '6', text: 'Task 交接示例 · 主 Agent 维护，子智能体只读' },
};
async function authorNotes(repoPath) {
  const repoId = randomUUID(), keys = ['root', 'files', 'parser', 'overview', 'guide', 'requirement', 'decision', 'idea', 'task'];
  const ids = Object.fromEntries(keys.map(key => [key, randomUUID()])), uri = key => `note://${repoId}/${ids[key]}`;
  const rows = [
    ['root', 'module.md', '项目工作台', 'module', null, '## Responsibility\n\n组织项目约定与文件阅读能力。\n\n## Design\n\n模块入口说明整体设计，主题文档和子模块共同维护项目事实。'],
    ['files', 'files/module.md', '文件阅读', 'module', 'root', '## Responsibility\n\n在工作台中阅读项目文件，保留当前工作区与阅读位置。\n\n## Design\n\n阅读约定保留在本层；解析与失败提示由子模块负责。'],
    ['parser', 'files/parser/module.md', '解析与提示', 'module', 'files', '## Responsibility\n\n解析文档并给出可操作的读取提示。\n\n## Design\n\n需求、决策、想法和 Task 各自保留职责，不复制为另一份模块正文。'],
    ['overview', 'project-guide.md', '项目约定', 'note', 'root', '## Design\n\n先阅读模块职责，再定位相关主题。所有模块共用稳定文档身份。'],
    ['guide', 'files/reading-guide.md', '阅读约定', 'note', 'files', '## Design\n\n打开文件时保留工作区上下文。'],
    ['requirement', 'files/parser/requirements/read-errors.md', '读取失败提示', 'requirement', 'parser', '## Expected behavior\n\n读取失败时保留当前位置，说明原因并允许重试。\n\n## Acceptance criteria\n\n- [ ] AC-1: 文件不可用时保留当前位置，并显示重试入口。'],
    ['decision', 'files/parser/error-context.md', '错误保留上下文', 'decision', 'parser', '## Problem\n\n空白预览会让用户失去阅读位置。\n\n## Decision\n\n失败时保留上下文与重试入口。\n\n## Alternatives considered\n\n关闭预览更简单，但会丢失位置。\n\n## Consequences\n\n需要明确显示错误状态，避免把旧内容当作最新结果。'],
    ['idea', 'files/parser/batch-import.md', '批量导入建议', 'idea', 'parser', '## Intent\n\n探索批量导入时逐项显示来源和读取结果。\n\n## Open questions\n\n优先验证单文件读取，批量操作尚未排期。'],
    ['task', 'files/parser/tasks/read-errors.md', '补齐失败提示', 'task', 'parser', '## Scope\n\n补充文件不可用时的重试入口。\n\n## Acceptance criteria\n\n按 work.acceptanceRefs 的固定 AC-1 验收。\n\n## Verification\n\n增加失败场景测试并运行。\n\n## Progress\n\n演示待办，尚未派发。\n\n## Evidence\n\n尚无执行结果或独立评估。\n\n## Handoff\n\n主 Agent 在交接前维护本段：先读 AC-1，再派发 coderX。子智能体只读本 Task，返回 Change Summary 与 Note 草稿；xflow 的 evaluatorX 独立返回 Evaluation Result。'],
  ];
  await mkdir(join(repoPath, '.agents/notes'), { recursive: true });
  await writeFile(join(repoPath, '.agents/harness.json'), JSON.stringify({ schemaVersion: 1, repoId, name: 'demo-blueprint', profile: SUPPORTED_HARNESS_PROFILE }, null, 2));
  for (const [key, path, title, kind, owner, body] of rows) {
    const meta = { schema: 'harness-note/2', id: ids[key], kind, lifecycle: kind === 'decision' ? 'implemented' : kind === 'idea' ? 'proposed' : 'accepted', created: '2026-10-08', updated: '2026-10-08T00:00:00Z',
      ...(kind === 'module' ? { moduleState: 'partial', ...(owner ? { parent: uri(owner) } : { role: 'project' }) } : { module: uri(owner) }),
      ...(kind === 'task' ? { work: { scope: [{ repoId, paths: ['src/'] }], acceptanceRefs: [{ uri: uri('requirement'), criterionId: 'AC-1' }], verification: [{ id: 'V-1', kind: 'command', required: true, repoId, cwd: '.', program: 'node', args: ['--test'] }], review: 'independent' } } : {}) };
    const raw = `---\n${JSON.stringify(meta, null, 2)}\n---\n\n# ${title}\n\n${body}\n`;
    expect(validateNote(parseNote(raw)), path).toEqual([]);
    await mkdir(dirname(join(repoPath, '.agents/notes', path)), { recursive: true });
    await writeFile(join(repoPath, '.agents/notes', path), raw);
  }
  const index = await buildNoteIndex(repoPath);
  expect(validateModuleStructure(index.entries, index.repoId)).toEqual([]);
  expect(index.readDiagnostics).toEqual([]);
  expect(new Set(index.entries.map(entry => entry.note.meta.kind)).size).toBe(6);
  return { uri, guidePath: join(repoPath, '.agents/notes/files/reading-guide.md') };
}

const model = await blueprintModel();
try { await runRecord(async ctx => {
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('blueprint'); ctx.recordingRoot = recordingRoot;
  const notes = await authorNotes(repoPath);
  git(repoPath, 'add', '-A'); git(repoPath, 'commit', '-m', 'demo maintained module documents');
  ctx.fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-blueprint-'));
  const claudeConfig = join(ctx.fixtureRoot, 'claude-config'); await mkdir(claudeConfig, { recursive: true });
  const { application, page } = await launchApp(ctx.fixtureRoot, claudeConfig); ctx.application = application; ctx.page = page;
  await page.evaluate(async baseURL => {
    await window.electron.experimental.update({ blueprint: true });
    const saved = await window.electron.llm.saveTerminalProvider('janus', { id: 'openai-compatible', name: '本地脚本演示', authType: 'api-key', enabled: true, apiKey: 'demo-local-only', baseURL, modelId: 'demo-model', models: ['demo-model'] });
    if (!saved.success) throw new Error('Demo provider setup failed');
    await window.electron.llm.setTerminalDefault('janus', 'openai-compatible');
  }, model.baseURL);
  await skipGate(page); await ensureWorkspace(page, 'demo-blueprint', repoPath);
  await ensureSidebarExpanded(page); await openWorkspace(page, 'demo-blueprint');
  await page.evaluate(cwd => window.electron.harness.rescan(cwd), repoPath);
  const frames = [], { clickSnap, typeSnap, rest } = snapper(page, rawDir, frames);
  const card = title => page.locator('.react-flow__node').filter({ has: page.locator('.bp-node-card__title', { hasText: new RegExp(`^${title}$`) }) });
  const nav = page.getByRole('navigation', { name: '模块导航' }), current = nav.locator('[aria-current="page"]');
  const detail = page.locator('.blueprint-workbench-detail-slot'), panel = page.locator('.bp-maintenance-panel');
  await clickSnap(page.getByRole('button', { name: /打开蓝图工作台/ }).first(), 'bp-1');
  await expect(current).toHaveText('项目工作台'); await expect(page.locator('.react-flow__node')).toHaveCount(3); await rest('bp-1', 200);
  await clickSnap(card('文件阅读'), 'bp-2'); await expect(detail).toContainText('阅读约定保留在本层');
  await expect(current).toHaveText('项目工作台'); await rest('bp-2', 180);
  await clickSnap(card('文件阅读'), 'bp-2', { double: true }); await expect(current).toHaveText('文件阅读');
  await expect(card('文件阅读')).toBeAttached(); await expect(card('阅读约定')).toBeAttached(); await rest('bp-2', 180);
  await clickSnap(card('解析与提示'), 'bp-3', { double: true }); await expect(current).toHaveText('解析与提示');
  await expect(page.locator('.react-flow__node')).toHaveCount(5); await rest('bp-3', 220);
  await clickSnap(nav.getByRole('button', { name: '返回', exact: true }), 'bp-3'); await expect(current).toHaveText('文件阅读');
  const refs = ['requirement', 'guide'].map((key, i) => ({ uri: notes.uri(key), role: i ? 'reference' : 'target', reason: i ? '上级模块阅读约定' : '当前需求' }));
  model.enqueue({ tool: 'note_scope', args: { reason: '一起讨论读取体验', notes: refs } }, { tool: 'note_focus', args: { reason: '查看失败提示需求', action: 'locate', notes: refs } }, { text: '已关注两份文档，并定位到读取失败提示。' });
  const composer = panel.locator('textarea').first();
  await typeSnap(composer, '请关注阅读约定和读取失败提示，定位读取失败提示。', 'bp-4'); await composer.press('Enter');
  await expect(panel).toContainText('已关注两份文档', { timeout: 30_000 });
  await expect(panel.locator('.janus-chat-stop')).toHaveCount(0, { timeout: 30_000 });
  await expect(panel.locator('.janus-chat-error-card')).toHaveCount(0);
  await expect(current).toHaveText('解析与提示'); await expect(detail).toContainText('文件不可用时保留当前位置');
  await expect(card('解析与提示')).toBeInViewport(); await rest('bp-4', 220);
  const scope = panel.locator('.bp-note-scope');
  await clickSnap(scope.locator('details > summary'), 'bp-4'); await expect(scope.locator('.bp-note-group')).toHaveCount(2);
  await clickSnap(scope.getByRole('button', { name: '阅读约定', exact: true }), 'bp-4'); await expect(current).toHaveText('文件阅读');
  const before = await readFile(notes.guidePath, 'utf8'), meta = parseNote(before).meta;
  model.enqueue({ tool: 'note_read', args: { uri: notes.uri('guide') } }, { tool: 'note_write', args: { reason: '补充失败时的阅读行为', operations: [{ type: 'update', uri: notes.uri('guide'), expectedHash: createHash('sha256').update(before).digest('hex'), sections: { Design: '打开文件时保留工作区上下文。读取失败时保留当前位置，并提供重试入口。' } }] } }, { text: '已原位更新阅读约定，保留文档身份并刷新更新时间；没有新建 Task。' });
  await typeSnap(composer, 'xdo 更新阅读约定：读取失败时保留当前位置，并提供重试入口。', 'bp-5'); await composer.press('Enter');
  await expect(panel).toContainText('已原位更新阅读约定', { timeout: 30_000 });
  await expect(panel.locator('.janus-chat-stop')).toHaveCount(0, { timeout: 30_000 });
  await expect(panel.locator('.janus-chat-error-card')).toHaveCount(0);
  await expect(detail).toContainText('读取失败时保留当前位置'); await rest('bp-5', 220);
  const after = parseNote(await readFile(notes.guidePath, 'utf8'));
  expect(after.meta.id).toBe(meta.id); expect(after.meta.created).toBe(meta.created); expect(after.meta.updated).not.toBe(meta.updated);
  const index = await buildNoteIndex(repoPath); expect(index.entries).toHaveLength(9);
  expect(index.entries.filter(entry => entry.note.meta.kind === 'task')).toHaveLength(1);
  await clickSnap(card('解析与提示'), 'bp-6', { double: true });
  await clickSnap(page.getByRole('button', { name: '适应画布', exact: true }), 'bp-6');
  await clickSnap(card('补齐失败提示'), 'bp-6');
  await expect(detail).toContainText('主 Agent 在交接前维护本段'); await rest('bp-6', 260); model.verify();
  await saveManifest(recordingRoot, { captions, name: 'feature-blueprint-workbench', frames, createdAt: new Date().toISOString(),
    evidence: { entry: resolve(process.env.SHOWCASE_ENTRY ?? 'out/main/index.js'), sourceCommit: process.env.SHOWCASE_SOURCE_COMMIT ?? git(process.cwd(), 'rev-parse', 'HEAD').trim(), agentSourceCommit: process.env.SHOWCASE_AGENT_COMMIT ?? null, model: 'local deterministic Responses server', calls: model.calls, documents: index.entries.length, preservedId: after.meta.id, created: after.meta.created, updatedBefore: meta.updated, updatedAfter: after.meta.updated } });
}); } finally { await model.close(); }
