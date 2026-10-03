import { timing } from './showcase-config.mjs';
const captions = {
  'hero-1': { badge: '★', text: '总览：三级归位，双盘并行' },
  'hero-2': { badge: '★', text: '终端里跑通git日志' },
  'hero-3': { badge: '★', text: '文件树对照，边看边改' },
  'hero-4': { badge: '★', text: '顶栏Island，随时开聊' },
};

// Record: hero overview — slow 4-act tour with real pauses between beats.
// Act1 sidebar levels / Act2 terminal git log+status (slow typing) /
// Act3 file tree open+hover / Act4 island hover. Long stills separate every beat.
// Output: showcase/hero-planche (README hero is the GIF).
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  prepareRepo, seedFixture, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, newShell, snapper, saveManifest, runRecord, sleep, git,
} from './record-lib.mjs';

await runRecord(async (ctx) => {
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('hero');
  ctx.recordingRoot = recordingRoot;
  git(repoPath, 'branch', 'feature/auth-retry');
  git(repoPath, 'worktree', 'add', '--detach', '../demo-auth');
  const { fixtureRoot, claudeConfig } = await seedFixture();
  ctx.fixtureRoot = fixtureRoot;
  const { application, page } = await launchApp(fixtureRoot, claudeConfig);
  ctx.application = application;
  ctx.page = page;

  await skipGate(page);
  await ensureWorkspace(page, 'demo-hero', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-hero');
  await newShell(page);

  const frames = [];
  const { center, snap, glideTo } = snapper(page, rawDir, frames);
  // inter-beat pause: still frame, no cursor — lets the viewer breathe
  const pause = (cap) => snap(null, false, timing.hold, cap);

  // ---- opening: orient 3s, no cursor ----
  await snap(null, false, timing.hold, 'hero-1');
  await sleep(500);

  // ---- act 1: sidebar three levels ----
  const row = page.locator('.workspace-sidebar .ws').filter({ hasText: 'demo-hero' }).first();
  const rc = center(await row.boundingBox());
  await glideTo(rc.x - 300, rc.y + 120, rc.x, rc.y, 8, 'hero-1');
  await sleep(600);
  await snap({ x: rc.x, y: rc.y }, false, 130, 'hero-1');
  await pause('hero-1');

  // ---- act 2: terminal, slow visible typing ----
  const term = page.locator('main section').first();
  const tb = await term.boundingBox();
  if (tb) await glideTo(tb.x + 100, tb.y + 100, tb.x + tb.width / 2, tb.y + 200, 8, 'hero-2');
  const input = page.locator('.xterm-helper-textarea').first();
  await input.focus().catch(() => {});
  await sleep(500);
  await input.pressSequentially('git log --oneline -5', { delay: 85 }).catch(() => {});
  await sleep(700);
  await snap(null, false, 90, 'hero-2');
  await input.press('Enter').catch(() => {});
  await sleep(1800);
  await snap(null, false, timing.hold, 'hero-2');
  await input.pressSequentially('git status -sb', { delay: 85 }).catch(() => {});
  await sleep(700);
  await snap(null, false, 90, 'hero-2');
  await input.press('Enter').catch(() => {});
  await sleep(1800);
  await snap(null, false, timing.hold, 'hero-2');
  await pause('hero-2');

  // ---- act 3: file tree ----
  await rm(join(repoPath, 'Microsoft'), { recursive: true, force: true }).catch(() => {});
  await sleep(800);
  const filesTool = page.getByRole('button', { name: /打开文件工具/ });
  if (await filesTool.count()) {
    const c = center(await filesTool.first().boundingBox());
    await glideTo(c.x - 220, c.y + 80, c.x, c.y, 8, 'hero-3');
    await sleep(600);
    await snap({ x: c.x, y: c.y }, false, 110, 'hero-3');
    await filesTool.first().click().catch(() => {});
    await sleep(1500);
    await snap({ x: c.x, y: c.y }, true, timing.click, 'hero-3');
    await sleep(600);
  }
  const fileRow = page.locator('[data-file-path="src/chain.ts"]');
  if (await fileRow.count()) {
    const fb = await fileRow.first().boundingBox().catch(() => null);
    if (fb) {
      const c = center(fb);
      await glideTo(c.x - 200, c.y - 40, c.x, c.y, 6, 'hero-3');
      await sleep(600);
      await snap({ x: c.x, y: c.y }, false, 130, 'hero-3');
    }
  }
  await pause('hero-3');

  // ---- act 4: island expands, long monitor hold, switch to chat, hold, collapse ----
  const island = page.locator('.janus-island').first();
  if (await island.count()) {
    const ib = await island.boundingBox().catch(() => null);
    if (ib) {
      const c = center(ib);
      await glideTo(c.x - 260, c.y + 160, c.x, c.y, 8, 'hero-4');
      await sleep(600);
      await snap({ x: c.x, y: c.y }, false, 130, 'hero-4');
      const expandedMark = page.locator('.janus-island .janus-expanded-view-button[data-view="chat"]');
      await island.dblclick();
      await snap({ x: c.x, y: c.y }, true, timing.click, 'hero-4');
      await sleep(1500);
      if (!(await expandedMark.count())) {
        await sleep(800);
        await island.dblclick();
        await sleep(1500);
      }
      if (!(await expandedMark.count())) throw new Error('hero island did not expand');
      await page.locator('.janus-island').getByText('核心可视化').first()
        .waitFor({ state: 'visible', timeout: 9000 }).catch(() => {});
      await sleep(600);
      await snap(null, false, timing.hold, 'hero-4');
      await sleep(800);
      await snap(null, false, timing.hold, 'hero-4');
      // switch to chat tab, hold long
      const chatTab = page.locator('.janus-island .janus-expanded-view-button[data-view="chat"]');
      const cb = await chatTab.first().boundingBox().catch(() => null);
      if (cb) {
        const t = center(cb);
        await glideTo(t.x - 200, t.y + 60, t.x, t.y, 8, 'hero-4');
        await sleep(600);
        await snap({ x: t.x, y: t.y }, false, 110, 'hero-4');
        await chatTab.first().click().catch(() => page.mouse.click(t.x, t.y));
        await snap({ x: t.x, y: t.y }, true, timing.click, 'hero-4');
        await sleep(1500);
        await snap(null, false, timing.hold, 'hero-4');
        await sleep(800);
        await snap(null, false, timing.hold, 'hero-4');
      }
      // collapse back for the clean closing still
      await island.dblclick();
      await sleep(1500);
      await snap(null, false, 120, 'hero-4');
    }
  }
  // ---- closing: wide still 4s ----
  // Microsoft/ can respawn on shell idle — sweep again right before the final still
  await rm(join(repoPath, 'Microsoft'), { recursive: true, force: true }).catch(() => {});
  await sleep(600);
  await snap(null, false, 220, 'hero-4');

  await saveManifest(recordingRoot, {
    captions,
    name: 'hero-planche', count: frames.length, frames,
    createdAt: new Date().toISOString(),
  });
  await rm(repoPath.replace(/demo-repo$/, 'demo-auth'), { recursive: true, force: true }).catch(() => {});
});
