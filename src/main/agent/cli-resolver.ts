import { exec } from 'child_process'
import { promisify } from 'util'
import { homedir } from 'os'
import { join } from 'path'

const execAsync = promisify(exec)

const pathCache = new Map<string, string | null>()

const COMMON_PATHS = [
  join(homedir(), '.local', 'bin'),
  join(homedir(), '.npm-global', 'bin'),
  join(homedir(), '.bun', 'bin'),
  '/usr/local/bin',
  '/usr/bin',
  join(homedir(), 'AppData', 'Roaming', 'npm'),
  join(homedir(), '.cargo', 'bin'),
]

export async function resolveCLIPath(command: string): Promise<string | null> {
  if (pathCache.has(command)) return pathCache.get(command)!

  // Try which/where first
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execAsync(`${cmd} ${command}`)
    const resolved = stdout.trim().split('\n')[0]
    if (resolved) {
      pathCache.set(command, resolved)
      return resolved
    }
  } catch { /* not found via which/where */ }

  // Try common paths
  const ext = process.platform === 'win32' ? '.cmd' : ''
  for (const dir of COMMON_PATHS) {
    try {
      const fullPath = join(dir, command + ext)
      await execAsync(`"${process.platform === 'win32' ? 'where' : 'test'}" "${fullPath}"`)
      pathCache.set(command, fullPath)
      return fullPath
    } catch { /* not found */ }
  }

  pathCache.set(command, null)
  return null
}

export function clearCache(): void {
  pathCache.clear()
}
