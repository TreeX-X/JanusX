// Showcase v3 shared record helpers: fixture, launch, sidebar, terminals, mouse-tracked snaps.
// Zero model calls: disposable TEMP fixture (creds never committed), waits for ready screens only.
import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, parse } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { AW, AH } from './showcase-lib.mjs';

export { AW, AH };
export const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

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

/** Demo repo with a few files (filetree/browser/markdown fixtures read these).
 *  `origin: true` adds a local bare remote so origin/main exists — the worktree
 *  composer defaults its start point to origin/main and refuses to create without it. */
export async function prepareRepo(tag, { origin = false } = {}) {
  await mkdir(resolve('.cache/showcase'), { recursive: true });
  const recordingRoot = await mkdtemp(resolve(`.cache/showcase/${tag}-`));
  const rawDir = join(recordingRoot, 'frames');
  await mkdir(rawDir, { recursive: true });
  const repoPath = join(recordingRoot, 'demo-repo');
  await mkdir(join(repoPath, 'src'), { recursive: true });
  await writeFile(join(repoPath, 'a.txt'), 'hi\n');
  await writeFile(join(repoPath, 'src', 'main.ts'), 'export const app = "demo";\n');
  await writeFile(join(repoPath, 'src', 'chain.ts'), 'export function chain(a: string, b: string): string {\n  return `${a}:${b}`;\n}\n');
  await writeFile(join(repoPath, 'page.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>demo</title></head><body><h1>JanusX 内置浏览器演示页</h1></body></html>\n');
  // silence host-side noise: PowerShell ModuleAnalysisCache + app .janusX dir
  await writeFile(join(repoPath, '.gitignore'), 'Microsoft/\n.janusX/\n');
  git(repoPath, 'init', '-b', 'main');
  git(repoPath, 'config', 'user.email', 'd@x');
  git(repoPath, 'config', 'user.name', 'd');
  git(repoPath, 'add', '-A');
  git(repoPath, 'commit', '-m', 'init');
  if (origin) {
    const originPath = join(recordingRoot, 'origin.git');
    await mkdir(originPath, { recursive: true });
    git(originPath, 'init', '--bare', '-b', 'main');
    git(repoPath, 'remote', 'add', 'origin', originPath);
    git(repoPath, 'push', '-u', 'origin', 'main');
  }
  return { recordingRoot, rawDir, repoPath };
}

/** Reuse local CLI logins in a disposable TEMP fixture (deleted by closeApp). */
export async function seedFixture() {
  const realHome = homedir();
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-feat-'));
  try { await copyFile(join(realHome, '.claude.json'), join(fixtureRoot, '.claude.json')); } catch {}
  try { cpSync(join(realHome, '.claude'), join(fixtureRoot, '.claude'), { recursive: true }); } catch {}
  try {
    mkdirSync(join(fixtureRoot, '.local', 'share', 'opencode'), { recursive: true });
    await copyFile(join(realHome, '.local', 'share', 'opencode', 'auth.json'), join(fixtureRoot, '.local', 'share', 'opencode', 'auth.json'));
  } catch {}
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
  return { fixtureRoot, claudeConfig };
}

export async function launchApp(fixtureRoot, claudeConfig) {
  const application = await electron.launch({
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
  const page = await application.firstWindow({ timeout: 60000 });
  page.setDefaultTimeout(15000);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(window.electron?.workspace?.create), null, { timeout: 30000 });
  await page.evaluate(() => window.electron.system.setLanguage('zh-CN')).catch(() => {});
  await page.evaluate(() => window.electron.theme.update('planche')).catch(() => {});
  await page.setViewportSize({ width: AW, height: AH });
  return { application, page };
}

export async function skipGate(page) {
  const gate = page.getByRole('button', { name: '稍后再说，先用本地功能' });
  await gate.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
  if (await gate.count()) await gate.click();
}

export async function ensureWorkspace(page, name, repoPath) {
  await page.evaluate((p) => window.electron.workspace.create({ name: p.name, path: p.path }), { name, path: repoPath });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => Boolean(window.electron?.workspace?.list), null, { timeout: 30000 });
  await sleep(1500);
  await skipGate(page);
}

export async function ensureSidebarExpanded(page) {
  if (await page.getByRole('button', { name: '展开工作区侧栏' }).count()) {
    await page.getByRole('button', { name: '展开工作区侧栏' }).click().catch(() => {});
  }
  await page.getByRole('button', { name: '收起工作区侧栏' }).first().waitFor({ state: 'visible', timeout: 10000 });
}

/** Open workspace row + expand its terminal list (both no-ops when already open). */
export async function openWorkspace(page, name) {
  await page.locator('.workspace-sidebar .ws').filter({ hasText: name }).first().click();
  await sleep(1200);
  await page.getByRole('button', { name: /展开 .* 终端列表/ }).first().click().catch(() => {});
  await sleep(600);
}

/** Create a Shell terminal via empty-state card or the New Terminal menu. */
export async function newShell(page) {
  try {
    await page.getByRole('main').getByText('Shell', { exact: true }).click({ timeout: 8000 });
  } catch {
    await page.getByRole('button', { name: 'New Terminal', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'New Shell terminal', exact: true }).click();
  }
  await page.locator('.xterm-helper-textarea').first().waitFor({ state: 'attached', timeout: 45000 });
  await sleep(2500);
  await rmMicrosoftJunk(page);
}

export async function rmMicrosoftJunk(page) {
  void page;
  // PowerShell drops Microsoft/ModuleAnalysisCache under cwd; caller repoPath known via evaluate is overkill —
  // best-effort no-op here, record scripts rm() their repoPath directly when needed.
}

/** Type into the focused shell and run. */
export async function shellRun(page, index, text) {
  const input = page.locator('.xterm-helper-textarea').nth(index);
  await input.focus().catch(() => {});
  await input.pressSequentially(text, { delay: 20 }).catch(() => {});
  await input.press('Enter').catch(() => {});
  await sleep(1500);
}

/** GIF tempo: all stored delays scale x1.8 — stills breathe, motion stays smooth. */
const TEMPO = 1.8;

/** Mouse-tracked snapshots. mouse is viewport coords; composed with OX/OY offset. */
/** Snapper with pluggable pixels: shot(page) defaults to the renderer
 *  screenshot; pass a compositor (e.g. browser view overlay) per script. */
export function snapper(page, rawDir, frames, shot = null) {
  const box = async (loc) => await loc.boundingBox();
  const center = (bb) => ({ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
  // Last parked cursor: rest frames reuse it so the pointer never blinks
  // out between click → hold → glide. Null until the first real move.
  let lastMouse = null;
  const take = shot ?? ((pg) => pg.screenshot({ type: 'png' }));
  async function snap(mouse, click, delay, cap) {
    if (mouse) lastMouse = { x: mouse.x, y: mouse.y };
    const png = await take(page);
    const idx = frames.length;
    const file = `p-${String(idx).padStart(2, '0')}.png`;
    await writeFile(join(rawDir, file), png);
    frames.push({ file, mouse, click: !!click, delay: Math.round(delay * TEMPO), cap });
  }
  // Visible travel between beats: every helper glides in from the parked
  // cursor instead of teleporting. Near-zero hops collapse to one frame.
  async function glideTo(x1, y1, x2, y2, steps, cap) {
    if (Math.hypot(x2 - x1, y2 - y1) < 3) {
      await page.mouse.move(x2, y2);
      await snap({ x: x2, y: y2 }, false, 8, cap);
      return;
    }
    for (let i = 1; i <= steps; i++) {
      const t = easeOutExpo(i / steps);
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      await page.mouse.move(x, y);
      await snap({ x, y }, false, 8, cap);
    }
  }
  async function travelFromLast(c, cap, steps) {
    if (lastMouse) await glideTo(lastMouse.x, lastMouse.y, c.x, c.y, steps, cap);
    else await page.mouse.move(c.x, c.y);
  }
  async function moveSnap(loc, cap, delay = 45) {
    const c = center(await box(loc));
    await travelFromLast(c, cap, 10);
    await sleep(450);
    await snap({ x: c.x, y: c.y }, false, delay, cap);
    return c;
  }
  /** One frame per keystroke: the GIF shows the text actually being typed. */
  async function typeSnap(loc, text, cap, { delay = 46, lead = 60, gap = 0 } = {}) {
    const c = center(await box(loc));
    await travelFromLast(c, cap, 10);
    await sleep(360);
    await snap({ x: c.x, y: c.y }, false, lead, cap);
    for (const ch of text) {
      await loc.press(ch, { delay: 0 }).catch(() => {});
      await sleep(gap);
      await snap({ x: c.x, y: c.y }, false, delay, cap);
    }
    return c;
  }
  async function clickSnap(loc, cap) {
    const c = center(await box(loc));
    await travelFromLast(c, cap, 8);
    await sleep(300);
    await loc.click().catch(() => page.mouse.click(c.x, c.y));
    await snap({ x: c.x, y: c.y }, true, 30, cap);
    await sleep(800);
    return c;
  }
  /** Rest frame: cursor stays parked at its last spot — the pointer never
   *  blinks out between click → hold → glide. Null only before first move. */
  async function rest(cap, delay = 170) {
    await snap(lastMouse, false, delay, cap);
  }
  return { box, center, snap, glideTo, moveSnap, typeSnap, clickSnap, rest };
}

export async function saveManifest(recordingRoot, manifest) {
  await writeFile(join(recordingRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Recorded ${manifest.name}: ${manifest.count} frames -> ${recordingRoot}`);
}

export async function closeApp(application, fixtureRoot) {
  try { await application?.close(); } catch {}
  await rm(fixtureRoot, { recursive: true, force: true }).catch(() => {});
}

/** Wrap a record main(): error shot + cleanup. Returns recordingRoot on success. */
export async function runRecord(main) {
  const ctx = { application: null, fixtureRoot: null, page: null, recordingRoot: null };
  try {
    await main(ctx);
  } catch (error) {
    console.error(error);
    if (ctx.page && ctx.recordingRoot) {
      try { console.log((await ctx.page.locator('body').innerText()).slice(-4000)); } catch {}
      await ctx.page.screenshot({ path: join(ctx.recordingRoot, 'capture-error.png') }).catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    await closeApp(ctx.application, ctx.fixtureRoot);
    if (ctx.recordingRoot) console.log(`Done: ${ctx.recordingRoot}`);
  }
  return ctx.recordingRoot;
}
