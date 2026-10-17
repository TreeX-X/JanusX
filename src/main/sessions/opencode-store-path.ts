import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

/** Shared by session discovery, transcript recovery and usage accounting. */
export function resolveOpencodeDbPath(home: string = homedir(), env: NodeJS.ProcessEnv = process.env): string {
  const base = join(env.XDG_DATA_HOME?.trim() || join(home, '.local', 'share'), 'opencode')
  const configured = env.OPENCODE_DB?.trim()
  return configured && configured !== ':memory:'
    ? isAbsolute(configured) ? configured : join(base, configured)
    : join(base, 'opencode.db')
}
