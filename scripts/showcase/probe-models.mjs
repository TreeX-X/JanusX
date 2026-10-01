// Probe: opencode /models list — find GPT-6-sol entry.
import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, parse } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, existsSync } from 'node:fs';
function testEnv(homeDir) { const root = parse(homeDir).root; return { ...process.env, ELECTRON_RENDERER_URL: '', NODE_ENV: 'production', JANUSX_KNOWLEDGE_ROOT: join(homeDir, 'knowledge'), HOME: homeDir, USERPROFILE: homeDir, HOMEDRIVE: root.replace(/[\\/]$/, ''), HOMEPATH: homeDir.slice(root.length - 1) }; }
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realHome = homedir();
const fixtureRoot = await mkdtemp(join(tmpdir(), 'janusx-probe-'));
const userDataDir = join(fixtureRoot, 'user-data');
const repoPath = join(fixtureRoot, 'demo-repo');
await mkdir(userDataDir, { recursive: true });
await mkdir(join(repoPath, 'src'), { recursive: true });
await writeFile(join(repoPath, 'a.txt'), 'hi\n');
git(repoPath, 'init', '-b', 'main');
git(repoPath, 'config', 'user.email', 'd@x'); git(repoPath, 'config', 'user.name', 'd');
git(repoPath, 'add', '-A'); git(repoPath, 'commit', '-m', 'init');
try { await copyFile(join(realHome, '.claude.json'), join(fixtureRoot, '.claude.json')); } catch {}
try { cpSync(join(realHome, '.claude'), join(fixtureRoot, '.claude'), { recursive: true }); } catch {}
try {
  mkdirSync(join(fixtureRoot, '.local', 'share', 'opencode'), { recursive: true });
  await copyFile(join(realHome, '.local', 'share', 'opencode', 'auth.json'), join(fixtureRoot, '.local', 'share', 'opencode', 'auth.json'));
} catch {}
if (existsSync(join(realHome, '.config', 'opencode', 'opencode.json'))) {
  mkdirSync(join(fixtureRoot, '.config', 'opencode'), { recursive: true });
  await copyFile(join(realHome, '.config', 'opencode', 'opencode.json'), join(fixtureRoot, '.config', 'opencode', 'opencode.json')).catch(() => {});
}
const exe = resolve('release/0.8.8/win-unpacked/JanusX.exe');
const application = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${userDataDir}`], env: { ...testEnv(fixtureRoot) }, timeout: 60000 });
const page = await application.firstWindow({ timeout: 60000 });
await page.waitForLoadState('domcontentloaded');
await page.waitForFunction(() => Boolean(window.electron?.workspace?.create), null, { timeout: 30000 });
await page.evaluate(() => window.electron.system.setLanguage('zh-CN')).catch(() => {});
await page.evaluate(() => window.electron.theme.update('planche')).catch(() => {});
await page.setViewportSize({ width: 1360, height: 780 });
const gate = page.getByRole('button', { name: '稍后再说，先用本地功能' });
await gate.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
if (await gate.count()) await gate.click();
await page.evaluate((path) => window.electron.workspace.create({ name: 'demo-login', path }), repoPath);
await page.reload();
await page.waitForLoadState('domcontentloaded');
await page.waitForFunction(() => Boolean(window.electron?.workspace?.list), null, { timeout: 30000 });
await sleep(1500);
const gate2 = page.getByRole('button', { name: '稍后再说，先用本地功能' });
await gate2.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
if (await gate2.count()) await gate2.click();
await page.locator('.workspace-sidebar .ws').filter({ hasText: 'demo-login' }).first().click();
await sleep(1500);
await page.getByRole('main').getByText('OpenCode', { exact: true }).click();
await page.locator('.xterm-helper-textarea').first().waitFor({ state: 'attached', timeout: 45000 }).catch(() => {});
await sleep(12000);
const input = page.locator('.xterm-helper-textarea').first();
await input.focus().catch(() => {});
await input.pressSequentially('/models').catch(() => {});
await sleep(1500);
await page.screenshot({ path: join(fixtureRoot, 'models-typed.png') });
await input.press('Enter').catch(() => {});
await sleep(2500);
await page.screenshot({ path: join(fixtureRoot, 'models-list.png') });
console.log('shots at', fixtureRoot);
await application.close();
