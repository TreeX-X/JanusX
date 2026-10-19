import { join, parse } from 'node:path'

export function createDesktopTestEnv(homeDir: string): NodeJS.ProcessEnv {
  const root = parse(homeDir).root
  return {
    ...process.env,
    ELECTRON_RENDERER_URL: '',
    NODE_ENV: 'production',
    // Knowledge storage has its own root; Electron's user-data flag does not
    // isolate it from the developer's APPDATA or an inherited root override.
    JANUSX_KNOWLEDGE_ROOT: join(homeDir, 'knowledge'),
    HOME: homeDir,
    USERPROFILE: homeDir,
    HOMEDRIVE: root.replace(/[\\/]$/, ''),
    HOMEPATH: homeDir.slice(root.length - 1),
  }
}

/**
 * First-run learning keeps its own coverage; shell flows seed `introduced` so
 * the welcome dialog never masks titlebar and island clicks. The record must
 * land before OnboardingHost initializes — a reload that happens first would
 * otherwise surface the welcome on the fresh page and hold a modal backdrop
 * over the whole window for the rest of the test.
 */
export function seedIntroducedLearning(runner: { addInitScript(pageFunction: () => void): Promise<unknown> }): Promise<unknown> {
  return runner.addInitScript(() => {
    try { localStorage.setItem('janusx:learning:v1', JSON.stringify({ version: 1, introduced: true })) } catch { /* learning stays dismissible without storage */ }
  })
}
