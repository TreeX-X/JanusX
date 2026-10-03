import { timing } from './showcase-config.mjs';
const captions = {
  'wt-1': { badge: '1', text: '左侧三级：工作区 任务盘 终端' },
  'wt-2': { badge: '2', text: '更多操作里新建任务盘' },
  'wt-3': { badge: '3', text: '逐字填表，提交到新分支' },
  'wt-4': { badge: '4', text: '看清差异，一键合并回主盘' },
  'wt-5': { badge: '5', text: '切回主盘，日志验证已合并' },
};

// Record: worktree management — three sidebar levels, real creation, real merge.
// Act1 tour 工作区 › 任务盘 › 终端 (all three levels on screen) /
// Act2 更多操作 → 新建任务盘 → keystroke-by-keystroke fill → 创建 /
// Act3 hover the new branch → 合并 → diff → 合并到 origin/main → 已合并，可删除任务盘。
// Zero model calls: a disposable TEMP fixture reuses local CLI logins, git only.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  prepareRepo, git, seedFixture, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, newShell, snapper, saveManifest, runRecord, sleep,
} from './record-lib.mjs';

const WT_NAME = 'demo-task';
const WT_BRANCH = 'feature/demo-task';

await runRecord(async (ctx) => {
  // origin: the composer's default start point is origin/main; without it, creation fails.
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('worktree', { origin: true });
  ctx.recordingRoot = recordingRoot;
  const { fixtureRoot, claudeConfig } = await seedFixture();
  ctx.fixtureRoot = fixtureRoot;
  const { application, page } = await launchApp(fixtureRoot, claudeConfig);
  ctx.application = application;
  ctx.page = page;

  await skipGate(page);
  await ensureWorkspace(page, 'demo-wt', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-wt');
  await newShell(page);

  const frames = [];
  const { box, center, snap, glideTo, moveSnap, typeSnap, clickSnap, rest } = snapper(page, rawDir, frames);
  const sidebar = page.locator('.workspace-sidebar');
  const wsRow = sidebar.locator('div.ws').filter({ hasText: 'demo-wt' }).first();
  // Worktree rows carry role=button + a git-branch glyph; the workspace row is excluded by its chevron.
  const wtRows = sidebar.locator('div[role="button"]').filter({ has: page.locator('svg.lucide-git-branch') });
  const termRows = sidebar.locator('div.group\\/terminal');

  // ---- act 1: the three levels, one slow pass over each ----
  // Each level gets glide-in + hover + DOUBLE still so the caption is readable.
  const mainWtRow = wtRows.first();
  await mainWtRow.waitFor({ state: 'visible', timeout: 15000 });
  await rest('wt-1', 170);
  await sleep(800);
  await rest('wt-1', 170);
  // level 1 — 工作区 (workspace row: container of everything below)
  {
    const c = await moveSnap(wsRow, 'wt-1', 120);
    await sleep(700);
    await snap({ x: c.x, y: c.y }, false, timing.hold, 'wt-1');
    await sleep(400);
    await snap({ x: c.x, y: c.y }, false, timing.hold, 'wt-1');
  }
  // level 2 — 任务盘 (branch row: branch + path; hold twice, then a close-up
  // on the branch/path line so "task disk = branch + path" is legible)
  {
    const c = await moveSnap(mainWtRow, 'wt-1', 120);
    await sleep(700);
    await snap({ x: c.x, y: c.y }, false, timing.hold, 'wt-1');
    await sleep(400);
    await snap({ x: c.x, y: c.y }, false, timing.hold, 'wt-1');
  }
  // level 3 — 终端 (terminal rows docked under their worktree)
  {
    const t = termRows.first();
    await t.waitFor({ state: 'visible', timeout: 15000 });
    const c = await moveSnap(t, 'wt-1', 120);
    await sleep(700);
    await snap({ x: c.x, y: c.y }, false, timing.hold, 'wt-1');
    await sleep(400);
    await snap({ x: c.x, y: c.y }, false, timing.hold, 'wt-1');
    // pull back so the tooltip clears and the nesting is legible in one frame
    await glideTo(c.x, c.y, c.x + 420, c.y + 120, 10, 'wt-1');
    await sleep(600);
    await snap({ x: c.x + 420, y: c.y + 120 }, false, 180, 'wt-1');
    await sleep(500);
    await snap({ x: c.x + 420, y: c.y + 120 }, false, 180, 'wt-1');
  }

  // ---- act 2: 更多操作 → 新建任务盘…, typed a keystroke at a time ----
  {
    // The ⋯ button is hover-reveal (group-hover/ws): hover the WORKSPACE row
    // itself so it becomes visible before we glide to it.
    await wsRow.hover().catch(() => {});
    await sleep(600);
    const more = wsRow.getByRole('button', { name: '更多操作' });
    await more.waitFor({ state: 'visible', timeout: 8000 });
    const mc = center(await box(more));
    await glideTo(mc.x - 280, mc.y + 90, mc.x, mc.y, 8, 'wt-2');
    await sleep(500);
    await snap({ x: mc.x, y: mc.y }, false, 110, 'wt-2');
    await clickSnap(more, 'wt-2');
    await sleep(600);
    await snap({ x: mc.x, y: mc.y }, true, 60, 'wt-2');
    await sleep(600);
    // browse both entries slowly before committing to one
    const runCfg = page.getByRole('button', { name: '运行配置…', exact: true });
    if (await runCfg.count()) await moveSnap(runCfg.first(), 'wt-2', 90);
    const create = page.getByRole('button', { name: '新建任务盘…', exact: true });
    await create.waitFor({ state: 'visible', timeout: 8000 });
    const cc = await moveSnap(create.first(), 'wt-2', 90);
    await sleep(400);
    await clickSnap(create.first(), 'wt-2');
    await sleep(1400);
    void cc;

    // the composer: 名称 / 分支 / 起始点, one frame per character
    const dialog = page.getByRole('dialog', { name: '新建任务盘' });
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await sleep(500);
    await rest('wt-3', 150);

    const nameInput = dialog.locator('input').nth(0);
    await nameInput.click().catch(() => {});
    // Slow typing: one GIF frame per keystroke (~210ms), double still after.
    await typeSnap(nameInput, WT_NAME, 'wt-3', { delay: timing.typing, lead: timing.hover });
    await sleep(800);
    await rest('wt-3', 170);
    await sleep(400);
    await rest('wt-3', 170);

    // 分支 auto-slugged from the name; append the namespace by hand, slowly
    const branchInput = dialog.locator('input').nth(1);
    const bc = center(await box(branchInput));
    await glideTo(bc.x - 60, bc.y + 120, bc.x, bc.y, 5, 'wt-3');
    await sleep(400);
    await snap({ x: bc.x, y: bc.y }, false, 110, 'wt-3');
    await branchInput.click().catch(() => {});
    await branchInput.fill('').catch(() => {});
    await typeSnap(branchInput, WT_BRANCH, 'wt-3', { delay: timing.typing, lead: timing.hover });
    await sleep(800);
    await snap({ x: bc.x, y: bc.y }, false, timing.hold, 'wt-3');
    await sleep(400);
    await snap({ x: bc.x, y: bc.y }, false, timing.hold, 'wt-3');

    // 起始点: retype origin/main so the merge base is stated, not assumed
    const startInput = dialog.locator('input').nth(2);
    const sc = center(await box(startInput));
    await glideTo(bc.x, bc.y, sc.x, sc.y, 5, 'wt-3');
    await sleep(400);
    await snap({ x: sc.x, y: sc.y }, false, 120, 'wt-3');
    await startInput.click().catch(() => {});
    await startInput.fill('').catch(() => {});
    await typeSnap(startInput, 'origin/main', 'wt-3', { delay: timing.typing, lead: timing.hover });
    await sleep(800);
    await snap({ x: sc.x, y: sc.y }, false, timing.hold, 'wt-3');
    await sleep(400);
    await snap({ x: sc.x, y: sc.y }, false, timing.hold, 'wt-3');

    const confirm = dialog.getByRole('button', { name: '创建', exact: true });
    await moveSnap(confirm, 'wt-3', 100);
    await clickSnap(confirm, 'wt-3');
    await sleep(2500);
  }

  // ---- the new worktree landed in the sidebar; give it a commit to merge ----
  const newRow = wtRows.filter({ hasText: WT_BRANCH }).first();
  await newRow.waitFor({ state: 'visible', timeout: 60000 });
  const wtPath = await newRow.getAttribute('aria-label');
  console.log('created worktree:', wtPath);
  if (!wtPath) throw new Error('new worktree row has no path');
  await writeFile(join(wtPath, 'src', 'retry.ts'), 'export function retryLogin(): boolean {\n  return true;\n}\n');
  git(wtPath, 'add', '-A');
  git(wtPath, 'commit', '-m', 'feat: add login retry');
  console.log('seeded commit on', WT_BRANCH);
  await sleep(2500);
  await rest('wt-3', 170);
  await sleep(600);
  await rest('wt-3', 170);

  // ---- act 3: hover the branch row → 合并 → diff → merge ----
  {
    const c = center(await box(newRow));
    await glideTo(c.x + 300, c.y + 80, c.x, c.y, 8, 'wt-4');
    await sleep(600);
    await snap({ x: c.x, y: c.y }, false, 130, 'wt-4');
    const merge = newRow.getByRole('button', { name: '合并', exact: true });
    await merge.waitFor({ state: 'visible', timeout: 8000 });
    const mc = center(await box(merge));
    await glideTo(c.x, c.y, mc.x, mc.y, 5, 'wt-4');
    await sleep(500);
    await snap({ x: mc.x, y: mc.y }, false, 120, 'wt-4');
    await clickSnap(merge, 'wt-4');
    await sleep(2600);
    await snap({ x: mc.x, y: mc.y }, false, 90, 'wt-4');
    await sleep(900);
    await snap({ x: mc.x, y: mc.y }, false, timing.hold, 'wt-4');
    await sleep(600);
    await snap({ x: mc.x, y: mc.y }, false, timing.hold, 'wt-4');

    // the diff readout is the point: hold on it
    const files = page.getByText(/files · /).first();
    if (await files.count()) {
      const fc = center(await box(files));
      await glideTo(mc.x, mc.y, fc.x, fc.y, 6, 'wt-4');
      await sleep(500);
      await snap({ x: fc.x, y: fc.y }, false, 180, 'wt-4');
      await sleep(600);
      await snap({ x: fc.x, y: fc.y }, false, 180, 'wt-4');
    }

    const doMerge = page.getByRole('button', { name: /^合并到 / });
    await doMerge.waitFor({ state: 'visible', timeout: 10000 });
    const dc = await moveSnap(doMerge, 'wt-4', 110);
    await sleep(500);
    await clickSnap(doMerge, 'wt-4');
    await sleep(3000);
    // 已合并，可删除任务盘。
    const ok = page.getByText('已合并，可删除任务盘。', { exact: true });
    if (await ok.count()) {
      const oc = center(await box(ok));
      await glideTo(dc.x, dc.y, oc.x, oc.y, 6, 'wt-4');
      await sleep(600);
      await snap({ x: oc.x, y: oc.y }, false, 190, 'wt-4');
      await sleep(700);
      await snap({ x: oc.x, y: oc.y }, false, 190, 'wt-4');
    } else {
      console.log('merge did not report success:', await page.locator('body').innerText().catch(() => ''));
      await rest('wt-4', 190);
    }
    // The ship dialog has no Esc handler; its header Close button is the way out.
    await page.getByRole('button', { name: 'Close', exact: true }).first().click({ timeout: 4000 }).catch(() => {});
    await sleep(1400);
    await rest('wt-4', 190);
    await sleep(700);
    await rest('wt-4', 190);
  }

  // ---- act 4: back on main, prove the merge landed via slow-typed git log ----
  {
    const c = await moveSnap(mainWtRow, 'wt-5', 120);
    await sleep(600);
    await clickSnap(mainWtRow, 'wt-5');
    await sleep(1800);
    await rest('wt-5', 180);
    const term = page.locator('main section').first();
    const tb = await term.boundingBox().catch(() => null);
    const input = page.locator('.xterm-helper-textarea').first();
    await input.focus().catch(() => {});
    await sleep(500);
    // One frame per keystroke so the command is readable as it is typed.
    const cmd = 'git log --oneline --all -6';
    const mx = tb ? tb.x + tb.width / 2 : c.x;
    const my = tb ? tb.y + 200 : c.y;
    await glideTo(c.x, c.y, mx, my, 10, 'wt-5');
    await sleep(360);
    await snap({ x: mx, y: my }, false, 120, 'wt-5');
    for (const ch of cmd) {
      await input.pressSequentially(ch, { delay: 0 }).catch(() => {});
      await snap({ x: mx, y: my }, false, 120, 'wt-5');
    }
    await sleep(700);
    await snap({ x: mx, y: my }, false, timing.hold, 'wt-5');
    await input.press('Enter').catch(() => {});
    await sleep(2000);
    await rest('wt-5', 190);
    await sleep(600);
    await rest('wt-5', 190);
  }

  await saveManifest(recordingRoot, {
    captions,
    name: 'feature-worktree', count: frames.length, frames,
    createdAt: new Date().toISOString(),
  });
});
