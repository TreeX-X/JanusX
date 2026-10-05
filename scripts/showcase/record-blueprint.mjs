// Note: asserted current-source recording — see .agents/notes/2026-10-03-readme-showcase--7b4800da.md
import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareRepo, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded, openWorkspace, snapper, saveManifest, runRecord, git } from './record-lib.mjs';

const captions = {
  'bp-1': { badge: '1', text: '打开工作区蓝图 · 项目与模块一目了然' },
  'bp-2': { badge: '2', text: '选择模块 · 阅读职责与接口契约' },
  'bp-3': { badge: '3', text: '关联决策 · 从结构追溯设计依据' },
  'bp-4': { badge: '4', text: '切换全部 Note · 查看规划与证据' },
  'bp-5': { badge: '5', text: '聚焦 Note · 带着上下文起草维护指令' },
};
async function authorNotes(repoPath) {
  const repoId = randomUUID();
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const uri = i => `note://${repoId}/${ids[i]}`;
  const notes = [
    ['项目工作台', 'initiative', 'accepted', 'tags: [architecture:project]', '## Goal\n\n让终端、文件与项目记录在同一个工作区协作。\n\n## Scope\n\n包含终端与文件对照两个模块，设计依据独立保存为 Note。\n\n## Acceptance criteria\n\n- [x] AC-1: 模块边界与接口可查看。'],
    ['终端与分屏', 'initiative', 'accepted', `tags: [architecture:module]\nparent: ${uri(0)}\ninterfaces:\n  - name: WorkspaceContext\n    direction: provides`, '## Goal\n\n多终端并行工作，保留每个任务的项目上下文。\n\n## Scope\n\n终端标签、拖拽分屏与工作区上下文。\n\n## Acceptance criteria\n\n- [x] AC-1: 提供工作区上下文供文件模块使用。'],
    ['文件对照', 'initiative', 'accepted', `tags: [architecture:module]\nparent: ${uri(0)}\ninterfaces:\n  - name: WorkspaceContext\n    direction: needs\n    provider: ${uri(1)}\nrelations:\n  - type: governed-by\n    target: ${uri(3)}`, '## Goal\n\n在主窗中并排阅读终端输出与项目文件。\n\n## Scope\n\n读取工作区上下文，提供文件树与嵌入预览。\n\n## Acceptance criteria\n\n- [x] AC-1: 双击文件在主窗打开预览。\n- [x] AC-2: 切换工作区后文件列表跟随更新。'],
    ['预览就近打开', 'decision', 'implemented', `parent: ${uri(2)}`, '## Problem\n\n检查终端结果时，频繁切换应用会打断阅读。\n\n## Decision\n\n双击文件在工作台内打开预览，与终端并排对照。\n\n## Alternatives considered\n\n外部编辑器提供完整编辑能力；嵌入预览更适合快速核对。\n\n## Consequences\n\n复杂编辑仍交给编辑器。'],
    ['分屏保留任务上下文', 'decision', 'implemented', `parent: ${uri(1)}`, '## Problem\n\n多个任务共享终端会混淆输出。\n\n## Decision\n\n每个终端保留独立会话，拖拽形成并排布局。\n\n## Alternatives considered\n\n单终端更节省空间；并排布局方便比较多个任务。\n\n## Consequences\n\n并行输出更易核对，也需要更宽的窗口。'],
  ];
  await mkdir(join(repoPath, '.agents', 'notes'), { recursive: true });
  await writeFile(join(repoPath, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId, name: 'demo-blueprint' }, null, 2));
  for (const [i, [title, kind, lifecycle, metadata, body]] of notes.entries()) {
    await writeFile(join(repoPath, '.agents', 'notes', `demo-${i}.md`), `---\nschema: harness-note/1\nid: ${ids[i]}\nkind: ${kind}\nlifecycle: ${lifecycle}\ncreated: 2026-10-05\nclass: feature\n${metadata}\n---\n# ${title}\n\n${body}\n`);
  }
}
await runRecord(async ctx => {
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('blueprint');
  ctx.recordingRoot = recordingRoot;
  await authorNotes(repoPath);
  git(repoPath, 'add', '-A');
  git(repoPath, 'commit', '-m', 'demo blueprint notes');
  // Local inspection: no copied credentials, model requests or submitted messages.
  ctx.fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-blueprint-'));
  const claudeConfig = join(ctx.fixtureRoot, 'claude-config');
  await mkdir(claudeConfig, { recursive: true });
  const { application, page } = await launchApp(ctx.fixtureRoot, claudeConfig);
  ctx.application = application;
  ctx.page = page;
  await page.evaluate(() => window.electron.experimental.update({ blueprint: true }));
  await skipGate(page);
  await ensureWorkspace(page, 'demo-blueprint', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-blueprint');
  await page.evaluate(cwd => window.electron.harness.rescan(cwd), repoPath);
  const frames = [];
  const { clickSnap, typeSnap, rest } = snapper(page, rawDir, frames);
  const nodes = page.locator('.react-flow__node');
  const button = name => page.getByRole('button', { name, exact: true });
  const detail = page.locator('.blueprint-workbench-detail-slot');
  await clickSnap(page.getByRole('button', { name: /打开蓝图工作台/ }).first(), 'bp-1');
  await expect(nodes).toHaveCount(3);
  await expect(button('系统结构')).toHaveAttribute('aria-pressed', 'true');
  await rest('bp-1', 220);
  await clickSnap(nodes.filter({ hasText: '文件对照' }), 'bp-2');
  await expect(detail).toContainText('双击文件在主窗打开预览');
  await expect(detail).toContainText('WorkspaceContext');
  await rest('bp-2', 240);
  await clickSnap(page.getByRole('region', { name: '决策与相关工作' }).getByRole('button', { name: '预览就近打开' }), 'bp-3');
  await expect(detail).toContainText('频繁切换应用会打断阅读');
  await rest('bp-3', 240);
  await clickSnap(button('全部 Note'), 'bp-4');
  await expect(nodes).toHaveCount(5);
  await clickSnap(button('适应画布').first(), 'bp-4');
  await rest('bp-4', 220);
  await clickSnap(nodes.filter({ hasText: '分屏保留任务上下文' }), 'bp-4');
  await expect(detail).toContainText('每个终端保留独立会话');
  await rest('bp-4', 180);
  await clickSnap(nodes.filter({ hasText: '文件对照' }), 'bp-5');
  const composer = page.getByPlaceholder('向 Janus 发送消息或执行命令…').first();
  await expect(composer).toBeVisible();
  const instruction = '请检查文件对照模块的验收项，补充预览失败时的提示要求。';
  await typeSnap(composer, instruction, 'bp-5');
  await expect(composer).toHaveValue(instruction);
  await rest('bp-5', 260);
  await saveManifest(recordingRoot, { captions, name: 'feature-blueprint-workbench', frames, createdAt: new Date().toISOString() });
});
