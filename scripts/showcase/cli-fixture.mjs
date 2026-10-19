import { mkdir, mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

export async function createFixture(ctx) {
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
