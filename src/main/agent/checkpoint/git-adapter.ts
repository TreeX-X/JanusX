import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout: 15000 })
  return stdout.trim()
}

export class GitAdapter {
  async getCurrentBranch(cwd: string): Promise<string> {
    return git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
  }

  async stashPush(cwd: string, message: string): Promise<string | null> {
    try {
      await git(cwd, 'stash', 'push', '-m', message, '--include-untracked')
      // Get the stash ref
      const stashList = await git(cwd, 'stash', 'list')
      const match = stashList.split('\n').find(line => line.includes(message))
      if (match) {
        const refMatch = match.match(/^(stash@\{\d+\})/)
        return refMatch ? refMatch[1] : null
      }
      return null
    } catch {
      return null
    }
  }

  async stashPop(cwd: string, stashRef: string): Promise<void> {
    await git(cwd, 'stash', 'pop', stashRef)
  }

  async stashDrop(cwd: string, stashRef: string): Promise<void> {
    try {
      await git(cwd, 'stash', 'drop', stashRef)
    } catch { /* may already be dropped */ }
  }

  async hashObject(cwd: string, filePath: string): Promise<string> {
    return git(cwd, 'hash-object', filePath)
  }

  async listTrackedFiles(cwd: string): Promise<string[]> {
    try {
      const output = await git(cwd, 'ls-files')
      return output ? output.split('\n').filter(Boolean) : []
    } catch {
      return []
    }
  }

  async diff(cwd: string, ...paths: string[]): Promise<string> {
    try {
      return await git(cwd, 'diff', '--', ...paths)
    } catch {
      return ''
    }
  }
}
