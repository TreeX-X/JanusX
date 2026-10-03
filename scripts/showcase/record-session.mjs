import { timing } from './showcase-config.mjs';
const captions = {
  'sess-1': { badge: '1', text: '会话面板：卡片只露概述' },
  'sess-2': { badge: '2', text: 'scope四档切换，搜索过滤' },
  'sess-3': { badge: '3', text: '点开卡片看两轮时间线' },
  'sess-4': { badge: '4', text: '查看详情读全量' },
  'sess-5': { badge: '5', text: '还原点展开看Diff' },
  'sess-6': { badge: '6', text: '两段式恢复防误删' },
};

// Record: session management — REAL sessions, turns and checkpoints, zero model calls.
// Phase A (setup boot): workspace + claude terminal (session row auto-created),
// two checkpoint:create snapshots with a real chain.ts edit between, close.
// Between: 2 turn rows appended to the persisted registry (demo transcript text,
// same honesty level as authored blueprint notes — no model ever ran).
// Phase B (record boot, same fixture): slow tour — scopes, search, card expand,
// detail window, checkpoint diff.
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  prepareRepo, launchApp, skipGate, ensureSidebarExpanded,
  openWorkspace, newShell, snapper, saveManifest, sleep, closeApp,
} from './record-lib.mjs';

const STILL = timing.hold;

const PROMPT_1 = '把登录接口接入到现有鉴权链路，给出改动方案';
const PROMPT_2 = '按方案实现 refreshToken，跑通登录冒烟';
const EXCERPT_1 = '方案：新增 login 路由并复用 token 中间件，改动 2 个文件。';
const EXCERPT_2 = '已实现并自测通过，chain.ts 新增 12 行。';

const { recordingRoot, rawDir, repoPath } = await prepareRepo('session');
const fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-sess-'));
const userDataDir = join(fixtureRoot, 'user-data');
await mkdir(userDataDir, { recursive: true });
console.log('frames:', rawDir);
console.log('fixture:', fixtureRoot);

// ---------------- Phase A: setup ----------------
let sessionId;
{
  const { application, page } = await launchApp(fixtureRoot, fixtureRoot);
  try {
    page.setDefaultTimeout(15000);
    await skipGate(page);
    await page.evaluate((p) => window.electron.workspace.create({ name: p.name, path: p.path }), { name: 'demo-sess', path: repoPath });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => Boolean(window.electron?.workspace?.list), null, { timeout: 30000 });
    await sleep(1500);
    await skipGate(page);
    // claude terminal: session row auto-created, no input ever sent (no model call)
    try {
      await page.getByRole('main').getByText('Claude', { exact: true }).click({ timeout: 8000 });
    } catch {
      await page.getByRole('button', { name: 'New Terminal', exact: true }).first().click();
      await page.getByRole('menuitem', { name: 'New Claude terminal', exact: true }).click();
    }
    await page.locator('.xterm-helper-textarea').first().waitFor({ state: 'attached', timeout: 45000 });
    await sleep(8000);
    const found = await page.evaluate((cwd) => window.electron.session.list({ cwd }).catch((e) => ({ error: String(e?.message ?? e) })), repoPath);
    console.log('sessions after spawn:', JSON.stringify(found).slice(0, 400));
    const rec = Array.isArray(found) ? found.find((s) => s.engine === 'claude') : null;
    if (!rec) throw new Error('no claude session row after spawn');
    sessionId = rec.id;
    const detail = await page.evaluate((sid) => window.electron.session.get(sid), sessionId);
    const terminalId = detail?.terminalIds?.[0];
    if (!terminalId) throw new Error('session has no terminal');
    // submitLine = renderer submit path WITHOUT pty write: real snapshot + firstPrompt + card count, zero model calls
    async function submitAndWait(prompt, expectCount) {
      await page.evaluate(({ tid, text }) => window.electron.terminal.submitLine(tid, text), { tid: terminalId, text: prompt });
      for (let i = 0; i < 15; i++) {
        await sleep(2000);
        const cps = await page.evaluate((cwd) => window.electron.checkpoint.list({ cwd }), repoPath);
        if (Array.isArray(cps) && cps.length >= expectCount) return cps;
      }
      throw new Error(`checkpoint ${expectCount} never landed`);
    }
    const after1 = await submitAndWait(PROMPT_1, 1);
    console.log('cp1:', after1[after1.length - 1]?.id);
    await appendFile(join(repoPath, 'src', 'chain.ts'),
      '\nexport function refreshToken(token: string): string {\n  return `refreshed:${token}`;\n}\n');
    await sleep(1000);
    const after2 = await submitAndWait(PROMPT_2, 2);
    console.log('cp2:', after2[after2.length - 1]?.id);
    console.log('checkpoint count: 2');
  } finally {
    try { await application?.close(); } catch {}
  }
}

// ---------------- Between: seed 2 turn rows ----------------
{
  const storePath = join(userDataDir, 'janusx', 'agent-sessions.json');
  const doc = JSON.parse(await readFile(storePath, 'utf8'));
  const rec = doc.sessions.find((s) => s.id === sessionId);
  if (!rec) throw new Error('seed target session missing');
  const now = Date.now();
  const iso = (dt) => new Date(dt).toISOString();
  rec.turns = [
    { id: randomUUID(), kind: 'done', startedAt: iso(now - 42 * 60000), endedAt: iso(now - 40 * 60000), prompt: PROMPT_1, excerpt: EXCERPT_1 },
    { id: randomUUID(), kind: 'done', startedAt: iso(now - 12 * 60000), endedAt: iso(now - 10 * 60000), prompt: PROMPT_2, excerpt: EXCERPT_2 },
  ];
  rec.turnCount = 2;
  rec.firstPrompt = PROMPT_1;
  rec.lastPrompt = PROMPT_2;
  rec.status = 'done';
  rec.branch = 'main';
  rec.updatedAt = iso(now);
  await writeFile(storePath, JSON.stringify(doc, null, 2));
  console.log('seeded turns on', sessionId);
}

// ---------------- Phase B: record ----------------
const frames = [];
let page;
let application;
try {
  ({ application, page } = await launchApp(fixtureRoot, fixtureRoot));
  page.setDefaultTimeout(15000);
  await skipGate(page);
  await page.waitForFunction(() => Boolean(window.electron?.workspace?.list), null, { timeout: 30000 });
  await sleep(1500);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-sess');
  // shell terminal for visuals only (shell creates no session row)
  await newShell(page);

  // verify seeded + live data
  const check = await page.evaluate((cwd) => Promise.all([
    window.electron.session.list({ cwd }).catch((e) => ({ error: String(e?.message ?? e) })),
    window.electron.checkpoint.list({ cwd }).catch((e) => ({ error: String(e?.message ?? e) })),
  ]), repoPath);
  console.log('verify:', JSON.stringify(check).slice(0, 500));
  const sessions = check[0];
  const target = Array.isArray(sessions) ? sessions.find((s) => s.turnCount >= 2) : null;
  if (!target) throw new Error('seeded session not loaded');
  if (target.checkpointCount < 2) throw new Error(`card count ${target.checkpointCount}, want >=2`);
  if (!Array.isArray(check[1]) || check[1].length < 2) throw new Error('checkpoints not live');

  const { snap, moveSnap, clickSnap, glideTo, box, center, typeSnap, rest } = snapper(page, rawDir, frames);
  // Cursor stays parked through every hold — no vanish/reappear between beats.
  const hold = rest;

  // ---- sess-1: L1 cards — open tool, establishing double still, slow pan ----
  const sessTool = page.getByRole('button', { name: /打开会话工具/ });
  await sessTool.first().click().catch(() => {});
  await sleep(1500);
  await hold('sess-1');
  await sleep(500);
  // dump panel buttons for selector discovery
  const btns = await page.getByRole('button').all().catch(() => []);
  const names = [];
  for (const b of btns.slice(0, 60)) names.push(await b.getAttribute('aria-label').catch(() => null) ?? await b.innerText().catch(() => ''));
  console.log('panel buttons:', JSON.stringify(names.filter(Boolean).slice(0, 40)));
  // slow pan across the card: header badge row tells the story (2 轮次 · 还原点 2)
  const badge = page.getByText(/还原点 2/).first();
  if (await badge.count()) {
    const bc = center(await box(badge));
    await glideTo(bc.x - 260, bc.y - 60, bc.x, bc.y, 10, 'sess-1');
    await sleep(700);
    await snap({ x: bc.x, y: bc.y }, false, STILL, 'sess-1');
    await sleep(400);
    await snap({ x: bc.x, y: bc.y }, false, STILL, 'sess-1');
  } else {
    await hold('sess-1');
  }

  // ---- sess-2: scope 四档 + 搜索慢打 ----
  // The cursor visibly TRAVELS tab to tab: glide in from the last point,
  // hover-hold, then click. No teleporting.
  let px = 880;
  let py = 440;
  const travelClick = clickSnap;
  for (const tab of ['工作区', '项目', '全部', '归档']) {
    const el = page.getByRole('button', { name: tab, exact: true });
    if (await el.count()) await travelClick(el.first(), 'sess-2');
  }
  // glide back to 工作区 so the seeded card is visible again
  const wsTab = page.getByRole('button', { name: '工作区', exact: true });
  if (await wsTab.count()) await travelClick(wsTab.first(), 'sess-2');
  // search: one frame per keystroke, double still on the filtered card
  const search = page.getByPlaceholder('按标题 / 目录 / 分支 / 模型过滤');
  if (await search.count()) {
    await search.first().click().catch(() => {});
    await typeSnap(search.first(), '登录', 'sess-2', { delay: timing.typing, lead: timing.hover });
    await sleep(900);
    await hold('sess-2');
    await search.first().fill('');
    await sleep(1000);
    await hold('sess-2');
  }

  // ---- sess-3: L2 inline timeline — expand card, hover turns + strip ----
  const card = page.getByText(PROMPT_1).first();
  await card.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  if (await card.count()) {
    const cb = await box(card).catch(() => null);
    if (cb) {
      const c = center(cb);
      await glideTo(c.x - 220, c.y - 40, c.x, c.y, 10, 'sess-3');
      await sleep(700);
      await snap({ x: c.x, y: c.y }, false, STILL, 'sess-3');
      await sleep(400);
      await card.click().catch(() => page.mouse.click(c.x, c.y));
      await snap({ x: c.x, y: c.y }, true, timing.click, 'sess-3');
      await sleep(1600);
      await hold('sess-3');
    }
  }
  // second turn row: the timeline keeps both rounds readable
  const turn2 = page.getByText(PROMPT_2).first();
  if (await turn2.count()) {
    const t2c = await moveSnap(turn2.first(), 'sess-3', 120);
    await sleep(700);
    await snap({ x: t2c.x, y: t2c.y }, false, STILL, 'sess-3');
    await sleep(400);
    await snap({ x: t2c.x, y: t2c.y }, false, STILL, 'sess-3');
  }

  // ---- sess-4: L3 detail window — full tour, cursor travels inside ----
  const detailBtn = page.getByRole('button', { name: '查看详情' });
  console.log('viewDetail count:', await detailBtn.count());
  const dlg = page.getByRole('dialog').first();
  if (await detailBtn.count()) {
    const dc0 = center(await box(detailBtn.first()));
    await glideTo(px, py, dc0.x, dc0.y, 12, 'sess-4');
    px = dc0.x;
    py = dc0.y;
    await sleep(700);
    await clickSnap(detailBtn.first(), 'sess-4');
    await sleep(2200);
    await hold('sess-4');
    // meta row: …/demo-repo · main · claude · 2 轮次 · 还原点 2
    const meta = dlg.getByText(/还原点 2/).first();
    if (await meta.count()) {
      const mc = center(await box(meta));
      await glideTo(px, py, mc.x, mc.y, 10, 'sess-4');
      px = mc.x;
      py = mc.y;
      await sleep(700);
      await hold('sess-4');
    }
    // nav rail: click turn 1 then turn 2 — the rail jumps the timeline
    const navBtns = dlg.locator('[data-nav]');
    console.log('navBtns:', await navBtns.count());
    for (const ni of [0, 1]) {
      const nb = navBtns.nth(ni);
      if (await nb.count()) {
        const nc = center(await box(nb));
        await glideTo(px, py, nc.x, nc.y, 10, 'sess-4');
        px = nc.x;
        py = nc.y;
        await sleep(600);
        await nb.click().catch(() => page.mouse.click(nc.x, nc.y));
        await snap({ x: nc.x, y: nc.y }, true, timing.click, 'sess-4');
        await sleep(1500);
        await hold('sess-4');
      }
    }
    // turn 2 excerpt: the done-state read
    const dlgTurn = dlg.getByText(EXCERPT_2).first();
    if (await dlgTurn.count()) {
      const tc = center(await box(dlgTurn));
      await glideTo(px, py, tc.x, tc.y, 10, 'sess-4');
      px = tc.x;
      py = tc.y;
      await sleep(700);
      await hold('sess-4');
    }
  }
  const travelDlg = async (loc, cap, { click = false } = {}) => {
    const c = center(await box(loc));
    await glideTo(px, py, c.x, c.y, 10, cap);
    px = c.x;
    py = c.y;
    await sleep(700);
    if (click) {
      await loc.click().catch(() => page.mouse.click(c.x, c.y));
      await snap({ x: c.x, y: c.y }, true, timing.click, cap);
      await sleep(1500);
    } else {
      await hold(cap);
    }
    return c;
  };

  // ---- sess-5: strip #1 — expand files, Diff side panel, collapse ----
  // #1 carries the chain.ts change; #2 is empty (0 files), so #1 owns the diff.
  const hash1 = dlg.getByText('#1', { exact: true }).first();
  console.log('hash1 count:', await hash1.count());
  if (await hash1.count()) {
    await travelDlg(hash1, 'sess-5', { click: true });
    await hold('sess-5');
  }
  const diffBtn = dlg.getByRole('button', { name: '查看 Diff', exact: true }).first();
  console.log('diffBtn count:', await dlg.getByRole('button', { name: '查看 Diff', exact: true }).count());
  if (await diffBtn.count()) {
    await travelDlg(diffBtn, 'sess-5', { click: true });
    await sleep(800);
    await hold('sess-5');
    // side panel file row: the change is one file deep
    const chainRow = dlg.getByText('src/chain.ts').first();
    if (await chainRow.count()) await travelDlg(chainRow, 'sess-5');
    else await hold('sess-5');
    // collapse the side panel again so the dialog narrows back
    const collapse = dlg.getByRole('button', { name: /收起 diff/ }).first();
    if (await collapse.count()) {
      await travelDlg(collapse, 'sess-5', { click: true });
      await sleep(800);
      await hold('sess-5');
    }
  } else {
    await hold('sess-5');
  }

  // ---- sess-6: two-step restore on #2, cancel out; continue hover; out ----
  // #2 is newest: its gate shows pruneOk. NEVER click confirm — demo repo stays put.
  const dlg2 = page.getByRole('dialog').first();
  const restore2 = dlg2.getByRole('button', { name: '恢复到 #2', exact: true }).first();
  console.log('restore2 count:', await dlg2.getByRole('button', { name: '恢复到 #2', exact: true }).count());
  if (await restore2.count()) {
    await travelDlg(restore2, 'sess-6', { click: true });
    await sleep(800);
    const confirm = dlg2.getByRole('button', { name: /确认恢复|确认还原/ }).first();
    if (await confirm.count()) {
      const cc = await travelDlg(confirm, 'sess-6');
      void cc;
      await rest('sess-6', 190);
      await sleep(500);
    }
    // 取消 retracts the gate — the point lands without touching the repo
    const cancel = dlg2.getByRole('button', { name: '取消', exact: true }).first();
    if (await cancel.count()) {
      await travelDlg(cancel, 'sess-6', { click: true });
      await sleep(800);
      await hold('sess-6');
    }
  } else {
    await hold('sess-6');
  }
  // footer: 在新会话中继续 exists as an option — hover only, never open
  const cont = dlg2.getByRole('button', { name: '在新会话中继续', exact: true }).first();
  if (await cont.count()) await travelDlg(cont, 'sess-6');
  // Escape closes the detail window (see SessionDetailWindow key handler).
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(1600);
  await hold('sess-6');

  await saveManifest(recordingRoot, {
    captions,
    name: 'feature-session', count: frames.length, frames,
    createdAt: new Date().toISOString(),
  });
  console.log(`Recorded feature-session -> ${recordingRoot}`);
} catch (error) {
  console.error(error);
  if (page) {
    try { console.log((await page.locator('body').innerText()).slice(-4000)); } catch {}
    await page.screenshot({ path: join(recordingRoot, 'capture-error.png') }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await closeApp(application, fixtureRoot);
  console.log(`Done: ${recordingRoot}`);
}
