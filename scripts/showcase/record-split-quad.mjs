// Real CLI startup and pointer-driven splits. Drafts are never submitted.
import { expect } from 'playwright/test';
import { mkdir, mkdtemp, writeFile, readFile, copyFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  prepareRepo, launchApp, skipGate, ensureWorkspace, ensureSidebarExpanded,
  openWorkspace, snapper, saveManifest, runRecord, sleep, AW, AH, git,
} from './record-lib.mjs';
import { style } from './showcase-config.mjs';

const captions = {
  ready: { badge: '1', text: '四种 CLI，保留各自的任务' },
  columns: { badge: '2', text: '拖到边缘，左右分屏' },
  rows: { badge: '3', text: '再上下拆分，组成四格' },
  resize: { badge: '4', text: '调节比例，给当前任务更多空间' },
  merge: { badge: '5', text: '拖回标签栏，重新合并' },
};
const drafts = {
  claude: 'Add search to the task board.',
  codex: 'Review the task filter edge cases.',
  opencode: 'Add tests for empty search results.',
  pi: 'Explain the task data flow.',
};

async function createFixture(ctx) {
  // Public demo path avoids publishing the user's name or repository context.
  const parent = process.platform === 'win32' ? process.env.PUBLIC ?? tmpdir() : tmpdir();
  const fixtureRoot = await mkdtemp(join(parent, 'janusx-split-'));
  ctx.fixtureRoot = fixtureRoot;
  const claudeConfig = join(fixtureRoot, 'claude-config');
  const codexHome = join(fixtureRoot, '.codex');
  const piHome = join(fixtureRoot, '.pi', 'agent');
  const opencodeHome = join(fixtureRoot, '.config', 'opencode');
  for (const dir of [claudeConfig, codexHome, piHome, opencodeHome]) await mkdir(dir, { recursive: true });
  // Only demo configuration and ordinary tool binaries; no account/session copies.
  await writeFile(join(claudeConfig, '.claude.json'), JSON.stringify({
    hasCompletedOnboarding: true, theme: 'light', autoUpdates: false,
  }));
  await writeFile(join(claudeConfig, 'settings.json'), JSON.stringify({
    env: { ANTHROPIC_API_KEY: 'demo-unused', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' },
    permissions: { defaultMode: 'default' },
  }));
  await writeFile(join(codexHome, 'config.toml'), [
    'model = "demo"', 'model_provider = "demo"', 'sandbox_mode = "read-only"',
    'check_for_update_on_startup = false', '[model_providers.demo]', 'name = "Local demo"',
    'base_url = "http://127.0.0.1:9/v1"', 'wire_api = "responses"', 'env_key = "JANUSX_DEMO_KEY"', '',
  ].join('\n'));
  await writeFile(join(piHome, 'settings.json'), JSON.stringify({
    theme: 'light', quietStartup: true, defaultProvider: 'demo', defaultModel: 'demo', lastChangelogVersion: '999.0.0',
  }));
  await writeFile(join(piHome, 'models.json'), JSON.stringify({ providers: { demo: {
    baseUrl: 'http://127.0.0.1:9/v1', api: 'openai-completions', apiKey: 'demo-unused',
    models: [{ id: 'demo', name: 'Local demo' }],
  } } }));
  await mkdir(join(piHome, 'bin'));
  for (const tool of ['fd.exe', 'rg.exe']) {
    try { await copyFile(join(homedir(), '.pi', 'agent', 'bin', tool), join(piHome, 'bin', tool)); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await writeFile(join(opencodeHome, 'opencode.json'), JSON.stringify({
    $schema: 'https://opencode.ai/config.json', theme: 'system', model: 'demo/demo', autoupdate: false,
    provider: { demo: { npm: '@ai-sdk/openai-compatible', name: 'Local demo',
      options: { apiKey: 'demo-unused', baseURL: 'http://127.0.0.1:9/v1' },
      models: { demo: { name: 'Local demo' } } } },
  }));
  return { fixtureRoot, claudeConfig, env: {
    CODEX_HOME: codexHome, PI_CODING_AGENT_DIR: piHome, PI_OFFLINE: '1',
    JANUSX_DEMO_KEY: 'demo-unused', OPENAI_API_KEY: 'demo-unused',
    ANTHROPIC_AUTH_TOKEN: '', NO_COLOR: '', OPENCODE_DISABLE_AUTOUPDATE: 'true',
  } };
}

async function buildEvidence() {
  const entry = resolve(process.env.SHOWCASE_ENTRY ?? 'out/main/index.js');
  const buildRoot = dirname(dirname(entry));
  const digest = createHash('sha256');
  async function visit(dir) {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, item.name);
      if (item.isDirectory()) await visit(path);
      else { digest.update(path.slice(buildRoot.length)); digest.update(await readFile(path)); }
    }
  }
  await visit(buildRoot);
  return { entry, buildSha256: digest.digest('hex'), recordingHead: git(resolve('.'), 'rev-parse', 'HEAD').trim(),
    buildSourcesPinned: false, workingTreeDirty: Boolean(git(resolve('.'), 'status', '--porcelain').trim()), node: process.version };
}

await runRecord(async (ctx) => {
  const fixture = await createFixture(ctx);
  const { recordingRoot, rawDir, repoPath } = await prepareRepo('split', { repoParent: fixture.fixtureRoot, repoName: 'Atlas' });
  ctx.recordingRoot = recordingRoot;
  await writeFile(join(repoPath, 'package.json'), JSON.stringify({
    name: 'atlas', private: true, type: 'module', scripts: { test: 'node --test' },
  }, null, 2));
  await mkdir(join(repoPath, 'tests'), { recursive: true });
  await writeFile(join(repoPath, 'src', 'tasks.ts'), 'export function searchTasks(tasks, query) {\n  return tasks.filter(task => task.title.toLowerCase().includes(query.toLowerCase()));\n}\n');
  await writeFile(join(repoPath, 'README.md'), '# Atlas\n\nA small task board for parallel development.\n');
  git(repoPath, 'add', '-A');
  git(repoPath, 'commit', '-m', 'Prepare Atlas split demo');
  const { application, page } = await launchApp(fixture.fixtureRoot, fixture.claudeConfig, { env: fixture.env });
  Object.assign(ctx, { application, page });
  await skipGate(page);
  const learning = page.getByRole('dialog').filter({ hasText: '首次入门' });
  if (await learning.count()) await learning.getByRole('button', { name: '关闭', exact: true }).click();
  await ensureWorkspace(page, 'Atlas', repoPath);
  await ensureSidebarExpanded(page);
  await openWorkspace(page, 'Atlas');
  await expect(page.locator('html')).toHaveAttribute('data-theme', style.theme);
  expect(await page.evaluate(() => window.electron.system.getLanguage())).toBe('zh-CN');

  const tab = (name) => page.locator('main [data-tab-id]').filter({ hasText: new RegExp(`^${name}$`, 'i') });
  const panes = page.locator('main section[data-pane-id]');
  const ids = {};
  for (const [index, name] of Object.keys(drafts).entries()) {
    const label = { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode', pi: 'Pi' }[name];
    if (index === 0) await page.getByRole('main').getByText(label, { exact: true }).click();
    else {
      await page.getByRole('button', { name: 'New Terminal', exact: true }).first().click();
      const item = page.getByRole('menuitem', { name: `New ${label} terminal`, exact: true });
      await expect(item).toBeVisible();
      await sleep(220); // Let the menu's real entrance animation finish.
      const rect = await item.boundingBox();
      if (!rect) throw new Error(`${label}: terminal menu closed before selection`);
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    }
    await expect(tab(name)).toHaveCount(1);
    ids[name] = (await tab(name).getAttribute('data-tab-id')).slice('terminal:'.length);
    // Finish creating tabs before filling drafts: CLI redraws can scroll xterm
    // and close the preset menu while another CLI is still starting.
    await sleep(4000);
  }
  for (const name of Object.keys(drafts)) {
    await tab(name).click();
    const input = page.locator('.xterm-helper-textarea:visible');
    await expect(input).toHaveCount(1);
    // Resolve only known setup screens in this newly-created local fixture.
    for (let attempt = 0; attempt < 35; attempt++) {
      await sleep(700);
      const text = await page.locator('.xterm-rows:visible').innerText();
      await input.focus();
      if (/Dark mode|Light mode/.test(text)) await input.press('Enter');
      else if (/Is this a project you created|Yes, I trust this folder/.test(text)) {
        await input.press('ArrowDown'); await input.press('Enter');
      } else if (/Detected a custom API key/.test(text)) {
        await input.press('ArrowUp'); await input.press('Enter');
      } else if (/Make auto mode your default permission mode/.test(text)) {
        await input.press('ArrowDown'); await input.press('Enter');
      } else if (/Trust this folder\?/.test(text)) await input.press('Enter');
      else if (/Hooks need review|new MCP servers/.test(text)) await input.press('Escape');
      else if (/Set up the Codex agent sandbox/.test(text)) {
        await input.press('ArrowDown'); await input.press('Enter');
      }
      else if ((name === 'claude' && /Claude Code v/.test(text) && /for shortcuts|shift\+tab to cycle/.test(text))
        || (name === 'codex' && /context left|Ask Codex|for shortcuts/.test(text))
        || (name === 'opencode' && /tab agents|ctrl\+p commands/.test(text))
        || (name === 'pi' && /0\.0%\/.*demo/s.test(text))) break;
      if (attempt === 34) throw new Error(`${name}: CLI did not reach its input screen`);
    }
    const text = await page.locator('.xterm-rows:visible').innerText();
    if (/No models available|not found|Error:|Sign in|log in to continue/i.test(text)) throw new Error(`${name}: startup problem`);
    if (name === 'claude') {
      // Reset the empty local CLI session before adding the demonstration draft.
      await page.keyboard.insertText('/clear'); await input.press('Enter');
      await sleep(1400);
    }
    if (name === 'codex' && /1 warning/.test(text)) {
      await input.press('F2'); await sleep(400);
      console.log('Codex startup warning:', await page.locator('.xterm-rows:visible').innerText());
      await input.press('Escape'); await sleep(400); await input.focus();
    }
    await page.keyboard.insertText(drafts[name]);
    await expect.poll(async () => (await page.locator('.xterm-rows:visible').innerText()).replace(/\s/g, '')).toContain(drafts[name].replace(/\s/g, ''));
    console.log(`${name}: ready with an unsent draft`);
    await sleep(1000);
  }
  await tab('claude').click();
  await sleep(800);
  const frames = [];
  const motion = snapper(page, rawDir, frames, null, { motion: 4, hover: 30, click: 8, settleMs: 160, travelPixelsPerStep: 40 });
  const checkpoints = [];
  const park = { x: AW - 80, y: AH - 45 };
  await page.mouse.move(park.x, park.y);
  await motion.snap(park, false, 180, 'ready');
  async function checkpoint(name, count, delay = 130) {
    await expect(panes).toHaveCount(count);
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
    const tabs = await tab('claude').count() + await tab('codex').count() + await tab('opencode').count() + await tab('pi').count();
    expect(tabs).toBe(4);
    if (count === 4) for (const name of Object.keys(drafts)) {
      await expect.poll(async () => (await paneOf(name).locator('.xterm-rows:visible').innerText()).replace(/\s/g, ''))
        .toContain(drafts[name].replace(/\s/g, ''));
    }
    await motion.rest(name, delay);
    checkpoints.push({ stage: name, frame: frames.length - 1, panes: count });
  }
  const paneOf = (name) => page.locator('main section[data-pane-id]').filter({ has: page.locator(`[data-tab-id="terminal:${ids[name]}"]`) });
  async function split(name, targetName, edge, count, stage) {
    const start = motion.center(await motion.box(tab(name)));
    const target = await motion.box(paneOf(targetName));
    const end = edge === 'right' ? { x: target.x + target.width - 24, y: target.y + target.height * 0.48 }
      : { x: target.x + target.width * 0.55, y: target.y + target.height - 24 };
    await motion.dragTo(start.x, start.y, end.x, end.y, 24, stage);
    await checkpoint(stage, count);
  }
  await split('codex', 'claude', 'right', 2, 'columns');
  await split('opencode', 'claude', 'bottom', 3, 'rows');
  await split('pi', 'codex', 'bottom', 4, 'rows');
  const vertical = page.locator('main [role="separator"][aria-orientation="vertical"]').first();
  const before = Number(await vertical.getAttribute('aria-valuenow'));
  const center = motion.center(await motion.box(vertical));
  await motion.dragTo(center.x, center.y, center.x - 105, center.y, 22, 'resize');
  expect(Number(await vertical.getAttribute('aria-valuenow'))).toBeLessThan(before - 3);
  await checkpoint('resize', 4, 180);
  const posterFrame = frames.length - 1;
  const source = motion.center(await motion.box(tab('pi')));
  const strip = await motion.box(paneOf('codex').locator('[data-tab-strip]'));
  await motion.dragTo(source.x, source.y, strip.x + strip.width - 70, strip.y + strip.height / 2, 24, 'merge');
  await checkpoint('merge', 3, 200);
  expect(await tab('codex').locator('xpath=ancestor::section[1]').getAttribute('data-pane-id'))
    .toBe(await tab('pi').locator('xpath=ancestor::section[1]').getAttribute('data-pane-id'));
  // Real end state, then an explicit 0.8s fade reset. No invisible UI rewrites.
  const last = frames.at(-1);
  const first = frames[0];
  for (const opacity of [0.8, 0.6, 0.4, 0.2, 0]) frames.push({ ...last, delay: 80, click: false, opacity, transition: 'loop-reset' });
  for (const opacity of [0.2, 0.4, 0.6, 0.8, 1]) frames.push({ ...first, delay: 80, click: false, opacity, transition: 'loop-reset' });
  await saveManifest(recordingRoot, {
    name: 'feature-split', captions, frames, posterFrame, createdAt: new Date().toISOString(),
    presentation: { framing: 'compact', theme: style.theme, background: style.background.asset, border: 12 },
    evidence: { ...await buildEvidence(), checkpoints, terminalPresets: Object.keys(drafts), drafts,
      promptsSubmitted: 0, accountsCopied: false, loopTransitionMs: 800 },
  });
});
