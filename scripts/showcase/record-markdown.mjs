const captions = {
  'md-1': { badge: '1', text: '底部抽屉切到Markdown' },
  'md-2': { badge: '2', text: '新建笔记逐字书写' },
  'md-3': { badge: '3', text: '分栏左写右看纯预览' },
};

// Record: Quick Note markdown — bottom drawer, slow-typed note,
// split edit/preview, pure preview render. Zero model calls.
import {
  prepareRepo, seedFixture, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, newShell, snapper, saveManifest, runRecord, sleep,
} from './record-lib.mjs';

await runRecord(async (ctx) => {
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('markdown');
  ctx.recordingRoot = recordingRoot;
  const { fixtureRoot, claudeConfig } = await seedFixture();
  ctx.fixtureRoot = fixtureRoot;
  const { application, page } = await launchApp(fixtureRoot, claudeConfig);
  ctx.application = application;
  ctx.page = page;

  await skipGate(page);
  await ensureWorkspace(page, 'demo-md', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-md');
  await newShell(page);

  const frames = [];
  const { rest, clickSnap, typeSnap } = snapper(page, rawDir, frames);
  const hold = rest;
  const travelClick = clickSnap;
  const mdType = typeSnap;

  // ---- md-1: bottom drawer -> Markdown tab ----
  const toggle = page.getByRole('button', { name: '切换 Runtime 状态面板' });
  await toggle.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await travelClick(toggle.first(), 'md-1');
  await sleep(1000);
  const mdTab = page.getByRole('tab', { name: 'Markdown' });
  if (await mdTab.count()) {
    await travelClick(mdTab.first(), 'md-1');
    await sleep(1000);
  }
  await hold('md-1');

  // ---- md-2: new note, slow-typed content ----
  const newNote = page.getByRole('button', { name: '新建笔记' });
  if (await newNote.count()) {
    await travelClick(newNote.first(), 'md-2');
    await sleep(1000);
  }
  const content = page.getByRole('textbox', { name: '笔记内容' });
  if (await content.count()) {
    await content.first().click().catch(() => {});
    // Hybrid: seed the head instantly (list-continuation would corrupt
    // char-by-char typing), slow-type the closing line for real.
    await content.first().fill('# 联调记录\n- [ ] 鉴权链路回归\n- [x] login-token 对齐\n\n');
    await sleep(700);
    await hold('md-2');
    await mdType(content.first(), '今日收尾：跑通主流程', 'md-2');
    await sleep(900);
    await hold('md-2');
  } else {
    await hold('md-2');
  }

  // ---- md-3: split view, then pure preview render ----
  const splitMode = page.getByRole('button', { name: '分栏', exact: true });
  if (await splitMode.count()) {
    await travelClick(splitMode.first(), 'md-3');
    await sleep(1200);
    await hold('md-3');
  }
  const previewMode = page.getByRole('button', { name: '预览', exact: true });
  if (await previewMode.count()) {
    await travelClick(previewMode.first(), 'md-3');
    await sleep(1200);
    await hold('md-3');
    await hold('md-3');
  } else {
    await hold('md-3');
  }

  await saveManifest(recordingRoot, {
    captions,
    name: 'feature-markdown', count: frames.length, frames,
    createdAt: new Date().toISOString(),
  });
});
