import { spawn } from 'node:child_process'

// Note: .agents/notes/workbench/file-tree-reveal-race.md — bound background refresh work.
const MAX_CONCURRENT_CHECKS = 2
const CHECK_TIMEOUT_MS = 3000
type Batch = { paths: Set<string>; resolve: Array<(ignored: Set<string>) => void> }
const queued = new Map<string, Batch>()
let active = 0
let scheduled = false

/** All directory requests queued for a root share one git process. */
export function getGitIgnoredPaths(rootPath: string, paths: string[]): Promise<Set<string>> {
  if (!paths.length) return Promise.resolve(new Set())
  return new Promise((resolve) => {
    let batch = queued.get(rootPath)
    if (!batch) {
      batch = { paths: new Set(), resolve: [] }
      queued.set(rootPath, batch)
    }
    paths.forEach(path => batch.paths.add(path))
    batch.resolve.push(resolve)
    if (!scheduled) {
      scheduled = true
      setTimeout(() => { scheduled = false; pump() }, 0)
    }
  })
}

function pump(): void {
  while (active < MAX_CONCURRENT_CHECKS && queued.size) {
    const [root, batch] = queued.entries().next().value!
    queued.delete(root)
    active++
    void check(root, [...batch.paths]).catch(() => new Set<string>()).then(ignored => {
      batch.resolve.forEach(resolve => resolve(ignored))
    }).finally(() => { active--; pump() })
  }
}

function check(root: string, paths: string[]): Promise<Set<string>> {
  return new Promise(resolve => {
    let output = ''
    let settled = false
    const child = spawn('git', ['check-ignore', '--no-index', '--stdin', '-z'], {
      cwd: root, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const finish = (ignored: Set<string>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ignored)
    }
    const timer = setTimeout(() => {
      // Git for Windows may launch a second git.exe; terminate the whole tree.
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => child.kill())
      } else child.kill('SIGKILL')
      finish(new Set())
    }, CHECK_TIMEOUT_MS)
    child.on('error', () => finish(new Set()))
    child.stdin.on('error', () => { /* A failed git may close stdin before the write. */ })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { output += chunk })
    child.on('close', code => finish(code === 0 || code === 1
      ? new Set(output.split('\0').filter(Boolean).map(path => path.replace(/\\/g, '/').replace(/\/$/, '')))
      : new Set()))
    child.stdin.end(paths.join('\0') + '\0')
  })
}
