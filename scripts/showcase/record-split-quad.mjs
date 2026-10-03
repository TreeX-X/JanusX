import { timing } from './showcase-config.mjs';
const captions = {
  'c1': { badge: '1', text: '左侧展开，四终端就绪' },
  'c2': { badge: '2', text: '拖到边缘 = 左右分屏' },
  'c3': { badge: '3', text: '再拖到底部 = 上下分屏' },
  'c4': { badge: '4', text: '田字格，四路并行' },
  'c5': { badge: '5', text: '拖分隔线调比例' },
};

// Record: four CLI terminals, drag to split and resize; no model prompts.
import {
  prepareRepo, seedFixture, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, snapper, saveManifest, runRecord, sleep, AW, AH,
} from './record-lib.mjs';

await runRecord(async (ctx) => {
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('split');
  ctx.recordingRoot = recordingRoot;
  const { fixtureRoot, claudeConfig } = await seedFixture();
  ctx.fixtureRoot = fixtureRoot;
  const { application, page } = await launchApp(fixtureRoot, claudeConfig);
  Object.assign(ctx, { application, page });
  const frames = [];
  await skipGate(page);
  await ensureWorkspace(page, 'demo-quad', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-quad');

  // ---- four terminals ----
  try {
    await page.getByRole('main').getByText('Claude', { exact: true }).click({ timeout: 8000 });
  } catch {
    await page.getByRole('button', { name: 'New Terminal', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'New Claude terminal', exact: true }).click();
  }
  await page.locator('.xterm-helper-textarea').first().waitFor({ state: 'attached', timeout: 45000 });
  await sleep(5000);
  for (const label of ['Codex', 'OpenCode', 'Pi']) {
    await page.getByRole('button', { name: 'New Terminal', exact: true }).first().click();
    await page.getByRole('menuitem', { name: `New ${label} terminal`, exact: true }).click();
    await sleep(5000);
  }

  const rowsText = (n) => page.locator('.xterm-rows').nth(n).evaluate((el) => el.textContent || '').catch(() => '');
  async function waitSettled(n, tag) {
    let last = await rowsText(n);
    let stable = 0;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const cur = await rowsText(n);
      if (cur === last && cur.length > 40) {
        stable++;
        if (stable >= 2) break;
      } else {
        stable = 0;
      }
      last = cur;
    }
    console.log(`settled[${tag}]: len=${last.length}`);
  }
  async function activateTab(re) {
    const tabs = page.locator('main [role="button"][draggable="true"]');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      if (re.test(((await tabs.nth(i).innerText()) || '').trim())) {
        await tabs.nth(i).click().catch(() => {});
        await sleep(800);
        return i;
      }
    }
    return -1;
  }
  for (const [i, tag] of [[0, 'claude'], [1, 'codex'], [2, 'opencode'], [3, 'pi']]) await waitSettled(i, tag);
  {
    await activateTab(/claude/i);
    const input = page.locator('.xterm-helper-textarea').nth(0);
    await input.focus().catch(() => {});
    let t0 = await rowsText(0);
    if (/Dark mode|Light mode/i.test(t0)) {
      await input.press('Enter').catch(() => {});
      await sleep(4000);
      t0 = await rowsText(0);
    }
    if (/trust this folder/i.test(t0)) {
      await input.press('ArrowDown').catch(() => {});
      await sleep(400);
      await input.press('Enter').catch(() => {});
      await sleep(5000);
      t0 = await rowsText(0);
    }
    // MCP consent screen blocks the prompt: dismiss it (local UI, no model call)
    if (/new MCP servers/i.test(t0)) {
      await input.press('Escape').catch(() => {});
      await sleep(4000);
      t0 = await rowsText(0);
    }
    console.log('claude head:', JSON.stringify(t0.slice(0, 80)));
  }
  {
    await activateTab(/codex/i);
    const input = page.locator('.xterm-helper-textarea').nth(1);
    await input.focus().catch(() => {});
    await input.press('Enter').catch(() => {});
    await sleep(5000);
  }
  for (const [i, tag] of [[0, 'claude'], [1, 'codex'], [2, 'opencode'], [3, 'pi']]) {
    console.log(`final[${tag}]: len=${(await rowsText(i)).length}`);
  }
  // sidebar still expanded for the establishing shot
  if (await page.getByRole('button', { name: '展开工作区侧栏' }).count()) {
    await page.getByRole('button', { name: '展开工作区侧栏' }).click().catch(() => {});
  }
  await page.getByRole('button', { name: /展开 .* 终端列表/ }).first().click().catch(() => {});
  await sleep(600);

  // ---- directed demo ----
  const { box, center, snap, glideTo, dragTo } = snapper(page, rawDir, frames);
  async function tabCenter(nameRe) {
    const tabs = page.locator('main [role="button"][draggable="true"]');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      if (nameRe.test(((await tabs.nth(i).innerText()) || '').trim())) return center(await box(tabs.nth(i)));
    }
    throw new Error('tab not found: ' + nameRe);
  }
  async function bigPanes() {
    const secs = page.getByRole('main').locator('section');
    const n = await secs.count();
    const out = [];
    for (let i = 0; i < n; i++) {
      const bb = await box(secs.nth(i)).catch(() => null);
      if (bb && bb.width > 150 && bb.height > 150) out.push(bb);
    }
    return out;
  }

  await snap(null, false, 100, 'c1');
  { // codex -> right edge = vertical split
    const c = await tabCenter(/codex/i);
    await glideTo(c.x - 220, c.y + 70, c.x, c.y, 6, 'c1');
    await sleep(450);
    await snap({ x: c.x, y: c.y }, false, 45, 'c1');
    const main = await box(page.getByRole('main'));
    await dragTo(c.x, c.y, main.x + main.width - 20, main.y + main.height / 2, 11, 'c2');
    await sleep(1500);
    const last = frames[frames.length - 1];
    await snap(last.mouse, false, timing.hold, 'c2');
  }
  { // opencode -> bottom of left pane = horizontal split
    const panes = await bigPanes();
    const left = panes.slice().sort((a, b2) => a.x - b2.x)[0];
    const c = await tabCenter(/opencode/i);
    await glideTo(c.x - 180, c.y - 60, c.x, c.y, 6, 'c2');
    await sleep(450);
    await snap({ x: c.x, y: c.y }, false, 45, 'c2');
    await dragTo(c.x, c.y, left.x + left.width / 2, left.y + left.height - 15, 11, 'c3');
    await sleep(1500);
    const last = frames[frames.length - 1];
    await snap(last.mouse, false, timing.hold, 'c3');
  }
  { // pi -> bottom of right pane = quad grid
    const panes = (await bigPanes()).slice().sort((a, b2) => a.x - b2.x);
    const right = panes[panes.length - 1];
    const c = await tabCenter(/^pi\b|[^a-z]pi/i);
    await glideTo(c.x - 180, c.y - 60, c.x, c.y, 6, 'c3');
    await sleep(450);
    await snap({ x: c.x, y: c.y }, false, 45, 'c3');
    await dragTo(c.x, c.y, right.x + right.width / 2, right.y + right.height - 15, 11, 'c4');
    await sleep(1500);
    const last = frames[frames.length - 1];
    await snap(last.mouse, false, timing.hold, 'c4');
    const seps = await page.getByRole('main').getByRole('separator').count();
    console.log('panes:', (await bigPanes()).length, 'seps:', seps);
    if ((await bigPanes()).length < 4 || seps < 3) throw new Error(`quad layout failed: panes=${(await bigPanes()).length} seps=${seps}`);
    // crash recovery: a CLI (Bun-level, e.g. opencode) can die mid-demo; Retry it in place
    const crashed = page.getByRole('button', { name: 'Retry', exact: true });
    if (await crashed.count()) {
      console.log('crashed terminal found, retrying...');
      const cbox = await box(crashed.first()).catch(() => null);
      if (cbox) {
        const cc = center(cbox);
        await glideTo(cc.x - 160, cc.y - 40, cc.x, cc.y, 5, 'c4');
        await page.mouse.click(cc.x, cc.y);
        await snap({ x: cc.x, y: cc.y }, true, timing.click, 'c4');
        await sleep(8000);
      } else {
        await crashed.first().click().catch(() => {});
        await sleep(8000);
      }
      const stillCrashed = await page.getByRole('button', { name: 'Retry', exact: true }).count();
      console.log('retry done, still crashed:', stillCrashed);
      if (stillCrashed) throw new Error('terminal still crashed after Retry');
      await snap(null, false, 120, 'c4');
    }
  }
  { // vertical separator resize
    const seps = page.getByRole('main').getByRole('separator');
    const n = await seps.count();
    let vbox = null;
    for (let i = 0; i < n; i++) {
      const bb = await box(seps.nth(i)).catch(() => null);
      const o = await seps.nth(i).getAttribute('aria-orientation').catch(() => null);
      if (bb && o === 'vertical' && bb.height > 300) {
        vbox = bb;
        break;
      }
    }
    if (!vbox) {
      let best = null;
      for (let i = 0; i < n; i++) {
        const bb = await box(seps.nth(i)).catch(() => null);
        if (bb && (!best || bb.height > best.height)) best = bb;
      }
      vbox = best;
    }
    const dc = center(vbox);
    const last = frames[frames.length - 1].mouse || { x: dc.x - 200, y: dc.y };
    await glideTo(last.x, last.y, dc.x, dc.y, 6, 'c5');
    await sleep(450);
    await snap({ x: dc.x, y: dc.y }, false, 45, 'c5');
    await dragTo(dc.x, dc.y, dc.x - 80, dc.y, timing.dragSteps, 'c5');
    await sleep(1200);
    await snap({ x: dc.x - 80, y: dc.y }, false, 120, 'c5');
  }

  // final gate: no crashed pane, quad layout intact
  {
    const crashed = await page.getByRole('button', { name: 'Retry', exact: true }).count();
    const panes = await bigPanes();
    const seps = await page.getByRole('main').getByRole('separator').count();
    const heads = [];
    for (let i = 0; i < 4; i++) heads.push((await rowsText(i)).slice(0, 40).replace(/\s+/g, ' '));
    console.log('final gate: crashed=%d panes=%d seps=%d', crashed, panes.length, seps);
    heads.forEach((h, i) => console.log(`pane[${i}]: ${h}`));
    if (crashed || panes.length < 4 || seps < 3) throw new Error(`final gate failed: crashed=${crashed} panes=${panes.length} seps=${seps}`);
  }

  const manifest = {
    captions,
    name: 'feature-split',
    viewport: { width: AW, height: AH },
    canvas: { FW: 1920, FH: 1080 },
    count: frames.length,
    frames,
    createdAt: new Date().toISOString(),
  };
  await saveManifest(recordingRoot, manifest);
});
