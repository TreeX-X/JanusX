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
