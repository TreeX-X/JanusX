// Record: quad AI-terminal split demo (claude/codex/opencode/pi) with left sidebar expanded.
// Produces raw frames + manifest only. Compose with compose.mjs (beige 1080P + virtual cursor).
// Zero model calls: reuses local CLI logins in a disposable fixture, waits for ready screens only.
import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, parse } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { AW, AH } from './showcase-lib.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
function testEnv(homeDir) {
  const root = parse(homeDir).root;
  return {
    ...process.env,
    ELECTRON_RENDERER_URL: '',
    NODE_ENV: 'production',
    JANUSX_KNOWLEDGE_ROOT: join(homeDir, 'knowledge'),
    HOME: homeDir,
    USERPROFILE: homeDir,
    HOMEDRIVE: root.replace(/[\\/]$/, ''),
    HOMEPATH: homeDir.slice(root.length - 1),
  };
}

// ---- roots: frames stay in repo cache (no creds); creds live in TEMP fixture ----
await mkdir(resolve('.cache/showcase-split-quad'), { recursive: true });
const recordingRoot = await mkdtemp(resolve('.cache/showcase-split-quad/session-'));
const rawDir = join(recordingRoot, 'frames');
await mkdir(rawDir, { recursive: true });
const repoPath = join(recordingRoot, 'demo-repo');
await mkdir(join(repoPath, 'src'), { recursive: true });
await writeFile(join(repoPath, 'a.txt'), 'hi\n');
await writeFile(join(repoPath, 'src', 'main.ts'), 'export const app = "demo";\n');
git(repoPath, 'init', '-b', 'main');
git(repoPath, 'config', 'user.email', 'd@x');
git(repoPath, 'config', 'user.name', 'd');
git(repoPath, 'add', '-A');
git(repoPath, 'commit', '-m', 'init');

const realHome = homedir();
const fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-quad-'));
console.log('frames:', rawDir);
console.log('fixture:', fixtureRoot);
try { await copyFile(join(realHome, '.claude.json'), join(fixtureRoot, '.claude.json')); } catch (e) { console.log('seed .claude.json SKIP', e.message); }
try { cpSync(join(realHome, '.claude'), join(fixtureRoot, '.claude'), { recursive: true }); } catch (e) { console.log('seed .claude/ SKIP', e.message); }
try {
  mkdirSync(join(fixtureRoot, '.local', 'share', 'opencode'), { recursive: true });
  await copyFile(join(realHome, '.local', 'share', 'opencode', 'auth.json'), join(fixtureRoot, '.local', 'share', 'opencode', 'auth.json'));
} catch (e) { console.log('seed opencode SKIP', e.message); }
mkdirSync(join(fixtureRoot, '.config', 'opencode'), { recursive: true });
await writeFile(join(fixtureRoot, '.config', 'opencode', 'opencode.json'), JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  model: 'opencode-go/gpt-6-luna',
}, null, 2));

const claudeConfig = join(fixtureRoot, 'claude-config');
await mkdir(claudeConfig, { recursive: true });
await writeFile(join(claudeConfig, '.claude.json'), JSON.stringify({
  hasCompletedOnboarding: true,
  theme: 'dark',
  autoUpdates: false,
}));

let application;
const frames = [];
let page;
try {
  application = await electron.launch({
    args: [resolve('out/main/index.js'), `--user-data-dir=${join(fixtureRoot, 'user-data')}`],
    env: {
      ...testEnv(fixtureRoot),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
      CLAUDE_CONFIG_DIR: claudeConfig,
      CLAUDE_CODE_SIMPLE: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_AUTOUPDATER: '1',
    },
    timeout: 60000,
  });
  page = await application.firstWindow({ timeout: 60000 });
  page.setDefaultTimeout(15000);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(window.electron?.workspace?.create), null, { timeout: 30000 });
  await page.evaluate(() => window.electron.system.setLanguage('zh-CN')).catch(() => {});
  await page.evaluate(() => window.electron.theme.update('planche')).catch(() => {});
  await page.setViewportSize({ width: AW, height: AH });

  const gate = page.getByRole('button', { name: '稍后再说，先用本地功能' });
  await gate.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
  if (await gate.count()) await gate.click();

  await page.evaluate((path) => window.electron.workspace.create({ name: 'demo-quad', path }), repoPath);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(window.electron?.workspace?.list), null, { timeout: 30000 });
  await sleep(1500);
  const gate2 = page.getByRole('button', { name: '稍后再说，先用本地功能' });
  await gate2.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
  if (await gate2.count()) await gate2.click();

  // ---- left workspace expanded (never collapsed in this demo) ----
  const expandSidebar = page.getByRole('button', { name: '展开工作区侧栏' });
  if (await expandSidebar.count()) await expandSidebar.click().catch(() => {});
  await page.getByRole('button', { name: '收起工作区侧栏' }).first().waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('.workspace-sidebar .ws').filter({ hasText: 'demo-quad' }).first().click();
  await sleep(1200);
  await page.getByRole('button', { name: /展开 .* 终端列表/ }).first().click().catch(() => {});
  await sleep(800);

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
  await rm(join(repoPath, 'Microsoft'), { recursive: true, force: true }).catch(() => {});

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
  const box = async (loc) => await loc.boundingBox();
  const center = (bb) => ({ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
  async function snap(mouse, click, delay, cap) {
    const png = await page.screenshot({ type: 'png' });
    const idx = frames.length;
    const file = `p-${String(idx).padStart(2, '0')}.png`;
    await writeFile(join(rawDir, file), png);
    frames.push({ file, mouse, click: !!click, delay, cap });
  }
  async function tabCenter(nameRe) {
    const tabs = page.locator('main [role="button"][draggable="true"]');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      if (nameRe.test(((await tabs.nth(i).innerText()) || '').trim())) return center(await box(tabs.nth(i)));
    }
    throw new Error('tab not found: ' + nameRe);
  }
  async function glideTo(x1, y1, x2, y2, steps, cap) {
    for (let i = 1; i <= steps; i++) {
      const t = easeOutExpo(i / steps);
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      await page.mouse.move(x, y);
      await snap({ x, y }, false, 8, cap);
    }
  }
  async function dragTo(x1, y1, x2, y2, steps, cap) {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      const t = easeInOut(i / steps);
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      await page.mouse.move(x, y);
      if (i === Math.floor(steps * 0.62)) {
        await sleep(500);
        await snap({ x, y }, false, 50, cap);
      } else {
        await snap({ x, y }, false, 10, cap);
      }
    }
    await page.mouse.up();
    await sleep(300);
    await snap({ x: x2, y: y2 }, true, 30, cap);
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
    await snap(last.mouse, false, 150, 'c2');
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
    await snap(last.mouse, false, 150, 'c3');
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
    await snap(last.mouse, false, 150, 'c4');
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
        await snap({ x: cc.x, y: cc.y }, true, 30, 'c4');
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
    await page.mouse.move(dc.x, dc.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      const t = easeInOut(i / 10);
      const x = dc.x - 80 * t;
      await page.mouse.move(x, dc.y);
      await snap({ x, y: dc.y }, false, 10, 'c5');
    }
    await page.mouse.up();
    await sleep(300);
    await snap({ x: dc.x - 80, y: dc.y }, true, 30, 'c5');
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
    name: 'terminal-split-quad',
    viewport: { width: AW, height: AH },
    canvas: { FW: 1920, FH: 1080 },
    count: frames.length,
    frames,
    createdAt: new Date().toISOString(),
  };
  await writeFile(join(recordingRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await mkdir(resolve('.cache/showcase-split-quad'), { recursive: true });
  await writeFile(resolve('.cache/showcase-split-quad/latest.json'), JSON.stringify({ ...manifest, dir: recordingRoot }, null, 2));
  console.log(`Recorded quad: ${frames.length} frames -> ${recordingRoot}`);
} catch (error) {
  console.error(error);
  if (page) {
    try {
      console.log((await page.locator('body').innerText()).slice(-4000));
    } catch {}
    await page.screenshot({ path: join(recordingRoot, 'capture-error.png') }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  try { await application?.close(); } catch {}
  await rm(fixtureRoot, { recursive: true, force: true }).catch(() => {});
  console.log(`Done: ${recordingRoot}`);
}
