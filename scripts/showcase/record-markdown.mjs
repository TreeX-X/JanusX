// Record: Quick Note markdown — bottom drawer, slow-typed note,
// split edit/preview, pure preview render. Zero model calls.
import {
  prepareRepo, seedFixture, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, newShell, snapper, saveManifest, runRecord, sleep,
} from './record-lib.mjs';

const STILL = 170;
const NOTE = '# 联调记录\n- [ ] 鉴权链路回归\n- [x] login->token 对齐\n\n今日收尾：跑通主流程';

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
  const { box, center, snap, glideTo, rest } = snapper(page, rawDir, frames);
  const hold = async (cap, ms = STILL) => {
    await rest(cap, ms);
    await sleep(400);
    await rest(cap, ms);
  };
  let px = 880;
  let py = 440;
  const travelClick = async (loc, cap) => {
    const c = center(await box(loc));
    await glideTo(px, py, c.x, c.y, 12, cap);
    px = c.x;
    py = c.y;
    await sleep(700);
    await hold(cap);
    await loc.click().catch(() => page.mouse.click(c.x, c.y));
    await snap({ x: c.x, y: c.y }, true, 30, cap);
    await sleep(800);
    return c;
  };
  // Slow typing with real newlines: one frame per keystroke.
  const mdType = async (loc, text, cap) => {
    const c = center(await box(loc));
    await glideTo(px, py, c.x, c.y, 10, cap);
    px = c.x;
    py = c.y;
    await sleep(360);
    await snap({ x: c.x, y: c.y }, false, 100, cap);
    for (const ch of text) {
      if (ch === '\n') await loc.press('Enter').catch(() => {});
      else await loc.pressSequentially(ch, { delay: 0 }).catch(() => {});
      await snap({ x: c.x, y: c.y }, false, 100, cap);
    }
    return c;
  };

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
    name: 'feature-markdown', viewport: { width: 1760, height: 884 },
    canvas: { FW: 1920, FH: 1080 }, count: frames.length, frames,
    createdAt: new Date().toISOString(),
  });
});
