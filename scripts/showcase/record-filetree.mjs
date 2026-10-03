import { timing } from './showcase-config.mjs';
const captions = {
  'ft-1': { badge: '1', text: '文件树跟随当前盘' },
  'ft-2': { badge: '2', text: '搜索秒过滤，改动有徽标' },
  'ft-3': { badge: '3', text: '切盘自动跟随新scope' },
  'ft-4': { badge: '4', text: '双击弹出独立编辑窗' },
  'ft-5': { badge: '5', text: '一键嵌入主窗左右对照' },
};

// Record: file tree follows worktree — scope follow, search, git badges, embed.
// Act1 file tool + tree walk / Act2 search slow-typing + git badge /
// Act3 switch worktree (scope follows, sweep) forth and back /
// Act4 double-click chain.ts -> standalone window -> embed beside terminal.
// Zero model calls: disposable fixture, git only.
import { writeFile, appendFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const gifReq = createRequire('C:/Users/Tree/AppData/Local/Temp/opencode/giftools/package.json');
const { PNG } = gifReq('pngjs');
import {
  prepareRepo, git, seedFixture, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, newShell, snapper, saveManifest, runRecord, sleep,
} from './record-lib.mjs';


await runRecord(async (ctx) => {
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('filetree');
  ctx.recordingRoot = recordingRoot;
  // Second checkout + unique file so scope-follow is visible in the tree.
  const authPath = join(recordingRoot, 'demo-auth');
  git(repoPath, 'worktree', 'add', '--detach', authPath);
  await writeFile(join(authPath, 'src', 'auth.ts'), 'export function login(user: string): boolean {\n  return user.length > 0;\n}\n');
  // Dirty main so the git badge (+1) has something to show.
  await appendFile(join(repoPath, 'src', 'chain.ts'), '\nexport const demoTouch = 1;\n');
  const { fixtureRoot, claudeConfig } = await seedFixture();
  ctx.fixtureRoot = fixtureRoot;
  const { application, page } = await launchApp(fixtureRoot, claudeConfig);
  ctx.application = application;
  ctx.page = page;

  await skipGate(page);
  await ensureWorkspace(page, 'demo-ft', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'demo-ft');
  await newShell(page);
  await rm(join(repoPath, 'Microsoft'), { recursive: true, force: true }).catch(() => {});

  const frames = [];
  const { box, center, snap, glideTo, clickSnap, typeSnap, rest } = snapper(page, rawDir, frames);
  const hold = rest;
  // Visible travel: glide in from the parked cursor, hover-hold, then act.
  let px = 880;
  let py = 440;
  const travelTo = async (loc, cap, steps = 10) => {
    const c = center(await box(loc));
    await glideTo(px, py, c.x, c.y, steps, cap);
    px = c.x;
    py = c.y;
    await sleep(700);
    await hold(cap);
    return c;
  };
  const travelClick = clickSnap;

  const sidebar = page.locator('.workspace-sidebar');
  const mainWtRow = sidebar.locator('div[role="button"]').filter({ has: page.locator('svg.lucide-git-branch') }).first();
  const authWtRow = sidebar.locator('div[role="button"]').filter({ hasText: 'demo-auth' }).first();

  // Directories toggle on single click; scope switches reload the tree
  // collapsed, so expand src wherever its children are needed.
  const ensureExpanded = async (cap) => {
    for (let i = 0; i < 3; i++) {
      if (await page.locator('[data-file-path="src/chain.ts"]').first().count()) return true;
      const srcRow = page.locator('[data-file-path="src"]').first();
      if (!(await srcRow.count())) return false;
      await travelClick(srcRow, cap);
      await sleep(1200);
    }
    return false;
  };

  // ---- act 1: file tool opens on the current disk, slow tree walk ----
  const filesTool = page.getByRole('button', { name: /打开文件工具/ });
  await travelClick(filesTool.first(), 'ft-1');
  await sleep(1200);
  await hold('ft-1');
  await ensureExpanded('ft-1');
  for (const fp of ['a.txt', 'src/chain.ts']) {
    const row = page.locator(`[data-file-path="${fp}"]`).first();
    if (await row.count()) await travelTo(row, 'ft-1');
  }
  // chain.ts carries the +1 touch: the git badge is the point here
  const chainRow = page.locator('[data-file-path="src/chain.ts"]').first();
  await chainRow.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  if (await chainRow.count()) {
    const cc = center(await box(chainRow));
    await glideTo(px, py, cc.x, cc.y, 10, 'ft-1');
    px = cc.x;
    py = cc.y;
    await sleep(700);
    await hold('ft-1');
  }

  // ---- act 2: search slow-typing, filtered badge row ----
  const search = page.getByPlaceholder('搜索文件...');
  if (await search.count()) {
    await search.first().click().catch(() => {});
    await typeSnap(search.first(), 'chain', 'ft-2', { delay: timing.typing, lead: timing.hover });
    await sleep(900);
    await hold('ft-2');
    await search.first().fill('');
    await sleep(1000);
    await hold('ft-2');
  } else {
    await hold('ft-2');
  }

  // ---- act 3: switch disk, tree follows (sweep); auth.ts proves it ----
  await authWtRow.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (await authWtRow.count()) {
    await travelClick(authWtRow, 'ft-3');
    await sleep(2600);
    await hold('ft-3');
    await ensureExpanded('ft-3');
    const authRow = page.locator('[data-file-path="src/auth.ts"]').first();
    await authRow.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (await authRow.count()) await travelTo(authRow, 'ft-3');
    else console.log('auth.ts row missing after switch');
    // back to main: auth.ts leaves with the scope
    await travelClick(mainWtRow, 'ft-3');
    await sleep(2600);
    await hold('ft-3');
    await ensureExpanded('ft-3');
  } else {
    console.log('second worktree row missing; skipping scope-follow');
    await hold('ft-3');
  }

  // ---- act 4: double-click pops the standalone editor window ----
  // The popup is a separate Electron window: capture it, letterbox onto the
  // 1760x884 card canvas, and drive the virtual cursor inside it.
  const popupFrame = async (editorPage, mouse, click, delay, cap) => {
    const shot = await editorPage.screenshot({ type: 'png' });
    const src = PNG.sync.read(shot);
    const W = 1760;
    const H = 884;
    // Screenshots are device px, locators are CSS px: scale the cursor.
    const innerW = await editorPage.evaluate(() => window.innerWidth).catch(() => src.width);
    const scale = innerW ? src.width / innerW : 1;
    if (!popupFrame.logged) {
      popupFrame.logged = true;
      console.log(`popup shot ${src.width}x${src.height}, inner ${innerW}, scale ${scale.toFixed(3)}`);
    }
    const dst = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      dst[i * 4] = 24;
      dst[i * 4 + 1] = 42;
      dst[i * 4 + 2] = 48;
      dst[i * 4 + 3] = 255;
    }
    const ox = Math.max(0, Math.floor((W - src.width) / 2));
    const oy = Math.max(0, Math.floor((H - src.height) / 2));
    for (let y = 0; y < src.height && oy + y < H; y++) {
      src.data.copy(dst, ((oy + y) * W + ox) * 4, (y * src.width) * 4, ((y + 1) * src.width) * 4);
    }
    const idx = frames.length;
    const file = `p-${String(idx).padStart(2, '0')}.png`;
    const out = new PNG({ width: W, height: H });
    out.data = dst;
    await writeFile(join(rawDir, file), PNG.sync.write(out));
    const mapped = mouse ? { x: mouse.x * scale + ox, y: mouse.y * scale + oy } : null;
    frames.push({ file, mouse: mapped, click: !!click, delay: Math.round(delay * 1.8), cap });
    return { ox, oy };
  };
  async function popEditor(c) {
    const editorPromise = application.waitForEvent('window', { timeout: 12000 }).catch(() => null);
    await chainRow.first().dblclick();
    await snap({ x: c.x, y: c.y }, true, timing.click, 'ft-4');
    const editorOpened = await editorPromise;
    if (!editorOpened) return null;
    await editorOpened.bringToFront().catch(() => {});
    await sleep(1800);
    return editorOpened;
  }
  await ensureExpanded('ft-4');
  if (!(await chainRow.count())) throw new Error('chain.ts row missing for embed');
  let editorPage = null;
  {
    const c = center(await box(chainRow.first()));
    await glideTo(px, py, c.x, c.y, 12, 'ft-4');
    px = c.x;
    py = c.y;
    await sleep(700);
    await hold('ft-4');
    editorPage = await popEditor(c);
    if (!editorPage) {
      console.log('embed retry...');
      editorPage = await popEditor(c);
    }
    if (!editorPage) throw new Error('editor popup never opened');
  }
  // ---- popup tour: content establishing, then the embed entry ----
  {
    const embedBtn = editorPage.getByRole('button', { name: '嵌入主窗口工作区' }).first();
    await embedBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const ebb = await embedBtn.boundingBox().catch(() => null);
    const ebc = ebb ? { x: ebb.x + ebb.width / 2, y: ebb.y + ebb.height / 2 } : null;
    // Cursor parks on the embed entry from the first popup frame: no blink.
    await popupFrame(editorPage, ebc, false, timing.hold, 'ft-4');
    await sleep(400);
    await popupFrame(editorPage, ebc, false, timing.hold, 'ft-4');
    if (await embedBtn.count()) {
      const bb = await embedBtn.boundingBox();
      if (bb) {
        const bc = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
        await editorPage.mouse.move(bc.x, bc.y).catch(() => {});
        await sleep(700);
        await popupFrame(editorPage, bc, false, timing.hold, 'ft-4');
        await sleep(400);
        await popupFrame(editorPage, bc, false, timing.hold, 'ft-4');
        await embedBtn.click().catch(() => editorPage.mouse.click(bc.x, bc.y).catch(() => {}));
        // The popup closes itself once embedded: the click frame is
        // best-effort; a closed target means success, not failure.
        await popupFrame(editorPage, bc, true, timing.click, 'ft-4').catch(() => null);
        await sleep(800);
      }
    } else {
      console.log('embed button missing in popup');
    }
  }
  // ---- act 5: embedded beside the terminal ----
  {
    await page.getByRole('region', { name: 'Embedded file editor' }).waitFor({ timeout: 12000 }).catch(() => {});
    await sleep(1200);
    const ok = (await page.getByRole('region', { name: 'Embedded file editor' }).count()) > 0;
    console.log('embedded:', ok);
    if (!ok) throw new Error('embed failed');
    try { await editorPage?.close().catch(() => {}); } catch {}
    await sleep(600);
    // sweep shell noise (PowerShell respawns Microsoft/) before the payoff
    await rm(join(repoPath, 'Microsoft'), { recursive: true, force: true }).catch(() => {});
    await sleep(800);
    // the payoff: editor + terminal side by side
    const region = page.getByRole('region', { name: 'Embedded file editor' }).first();
    const rc = center(await box(region));
    await glideTo(px, py, rc.x, rc.y, 12, 'ft-5');
    px = rc.x;
    py = rc.y;
    await sleep(700);
    await hold('ft-5');
    const term = page.locator('main section').first();
    const tb = await term.boundingBox().catch(() => null);
    if (tb) {
      await glideTo(px, py, tb.x + tb.width / 2, tb.y + 200, 10, 'ft-5');
      px = tb.x + tb.width / 2;
      py = tb.y + 200;
      await sleep(700);
      await hold('ft-5');
    }
  }
  await hold('ft-5');

  await saveManifest(recordingRoot, {
    captions,
    name: 'feature-filetree', count: frames.length, frames,
    createdAt: new Date().toISOString(),
  });
});
