import { parse } from 'node:path'

export function createDesktopTestEnv(homeDir: string): NodeJS.ProcessEnv {
  const root = parse(homeDir).root
  return {
    ...process.env,
    ELECTRON_RENDERER_URL: '',
    NODE_ENV: 'production',
    HOME: homeDir,
    USERPROFILE: homeDir,
    HOMEDRIVE: root.replace(/[\\/]$/, ''),
    HOMEPATH: homeDir.slice(root.length - 1),
  }
}
