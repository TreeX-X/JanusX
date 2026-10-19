// Authored native JSONL samples go through the real external scanner and reader.
import { expect } from 'playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFixture } from './cli-fixture.mjs';
import { buildEvidence } from './blueprint-fixture.mjs';
import { prepareRepo, launchApp, ensureWorkspace, ensureSidebarExpanded, openWorkspace, runRecord } from './record-lib.mjs';
import { readyWindow, saveStill, finishStills, startPi, digest } from './static-lib.mjs';

const prompts = ['检查任务搜索的大小写处理与结果顺序', '补充短搜索词与空结果的回归清单'];
const answers = ['示例外部记录：filterTasks 在本地匹配标题，先去除空格并转为小写；filter 保持任务的原有顺序。', '回归清单：\n1. 空输入与单字符显示全部任务。\n2. SEARCH 与 search 返回相同结果。\n3. 没有匹配项时保留筛选词。\n4. 使用 npm test 验证三项搜索检查。'];
await runRecord(async ctx => {
  const fixture = await createFixture(ctx);
  const { recordingRoot, repoPath } = await prepareRepo('external-session-stills', { repoParent: fixture.fixtureRoot, repoName: 'Atlas' }); ctx.recordingRoot = recordingRoot;
  const providerSessionId = randomUUID();
  const dir = join(fixture.claudeConfig, 'projects', repoPath.replace(/[^a-zA-Z0-9]/g, '-')); await mkdir(dir, { recursive: true });
  const path = join(dir, providerSessionId + '.jsonl'), now = Date.now();
  const rows = prompts.flatMap((prompt, i) => [
    { type: 'user', uuid: randomUUID(), sessionId: providerSessionId, cwd: repoPath, timestamp: new Date(now - (40 - i * 15) * 60000).toISOString(), message: { role: 'user', content: prompt } },
    { type: 'assistant', uuid: randomUUID(), sessionId: providerSessionId, cwd: repoPath, timestamp: new Date(now - (38 - i * 15) * 60000).toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: answers[i] }], stop_reason: 'end_turn' } },
  ]);
  const log = rows.map(r => JSON.stringify(r)).join('\n') + '\n'; await writeFile(path, log);
  const piPath = join(fixture.env.PI_CODING_AGENT_DIR, 'settings.json');
  await writeFile(piPath, JSON.stringify({ ...JSON.parse(await readFile(piPath, 'utf8')), theme: 'dark' }));
  const { application, page } = await launchApp(fixture.fixtureRoot, fixture.claudeConfig, { env: fixture.env }); Object.assign(ctx, { application, page });
  await readyWindow(application, page, 'dark');
  await page.evaluate(() => window.electron.experimental.update({ sessions: true }));
  await ensureWorkspace(page, 'Atlas · 示例外部会话', repoPath); await ensureSidebarExpanded(page); await openWorkspace(page, 'Atlas · 示例外部会话');
  await startPi(page, 'Continue reviewing the local search checklist.');
  const scan = await page.evaluate(() => window.electron.session.scanExternal());
  const session = (await page.evaluate(cwd => window.electron.session.list({ cwd }), repoPath)).find(s => s.providerSessionId === providerSessionId);
  expect(session?.external).toBe(true); expect(session.turnCount).toBe(2); expect(session.engine).toBe('claude');
  await page.getByRole('button', { name: /打开会话工具/ }).first().click();
  await page.getByPlaceholder('按标题 / 目录 / 分支 / 模型过滤').fill('大小写');
  const card = page.locator(`[data-session-id="${session.id}"]`); await expect(card).toContainText('外部');
  await card.getByRole('button', { name: '展开', exact: true }).click();
  await expect(card).toContainText(prompts[1]);
  const assets = [await saveStill(ctx, 'feature-session-external-list', { external: true, engine: 'claude', turns: 2, scan })];
  await card.getByRole('button', { name: '查看详情', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('外部会话 · 软件外产生的 CLI 会话，详情窗读取落盘转录。');
  await expect(dialog).toContainText(answers[0]); await expect(dialog).toContainText('回归清单');
  await expect(dialog.getByRole('button', { name: '回到原会话', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: '复制续接命令', exact: true })).toBeEnabled();
  assets.push(await saveStill(ctx, 'feature-session-external', { external: true, engine: 'claude', turns: 2, readOnlyTranscript: true, nativeResumeAvailable: true, resumeExecuted: false,
    transcriptHash: digest(log), dialogText: await dialog.innerText() }));
  expect(await readFile(path, 'utf8')).toBe(log);
  await finishStills(ctx, 'external-session', assets, { ...await buildEvidence(), sampleNativeTranscript: true, scannerImported: true, sourceUnchanged: true });
});
