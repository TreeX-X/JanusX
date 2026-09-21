// Note: hosted platform abstraction with GitHub over gh CLI — see
// .agents/notes/implemented/feature/2026-09-21-hosted-github-reviews.md
import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
  FailedCheckLog,
  HostedCapability,
  HostedCheck,
  HostedProviderId,
  HostedReview,
} from '../../shared/ipc/hosted'
import { gitRemoteUrl, parseGitRemote } from '../git/worktrees'

const execFileAsync = promisify(execFile)
const HOSTED_TIMEOUT_MS = 30000
const FAILED_LOG_BYTES = 6 * 1024

export interface HostedProvider {
  id: HostedProviderId
  capabilities: HostedCapability[]
  detect(cwd: string): Promise<boolean>
  listReviews(cwd: string, branch: string): Promise<HostedReview[]>
  getChecks(cwd: string, branch: string): Promise<HostedCheck[]>
  getFailedLogs(cwd: string, branch: string): Promise<FailedCheckLog[]>
  createReview(cwd: string, input: { title: string; body?: string; base: string; head: string; draft?: boolean }): Promise<HostedReview>
  mergeReview(cwd: string, number: number, method?: 'squash' | 'merge' | 'rebase'): Promise<{ merged: boolean }>
}

async function runGh(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('gh', args, { cwd, timeout: HOSTED_TIMEOUT_MS })
    return stdout
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const stderr = (err as { stderr?: string })?.stderr?.trim()
    throw new Error(stderr || message || 'gh 调用失败')
  }
}

function safeJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

interface GhPr {
  number?: number
  title?: string
  isDraft?: boolean
  state?: string
  baseRefName?: string
  headRefName?: string
  url?: string
  statusCheckRollup?: Array<{ status?: string; conclusion?: string }>
}

export function parsePrList(payload: unknown, branch: string): HostedReview[] {
  if (!Array.isArray(payload)) return []
  return payload
    .filter((item): item is GhPr => !!item && typeof item === 'object')
    .filter((item) => item.headRefName === branch && typeof item.number === 'number')
    .map((item) => {
      const state = String(item.state ?? '').toUpperCase()
      const reviewState =
        state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'closed' : item.isDraft ? 'draft' : 'open'
      const rollup = item.statusCheckRollup ?? []
      const bad = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STALE'])
      const failing = rollup.some((check) => !!check.conclusion && bad.has(String(check.conclusion)))
      const pending = !failing && rollup.some((check) => check.status !== 'COMPLETED')
      return {
        number: item.number as number,
        title: String(item.title ?? ''),
        state: reviewState,
        base: String(item.baseRefName ?? ''),
        head: String(item.headRefName ?? ''),
        url: String(item.url ?? ''),
        checksState: failing ? 'failing' : pending ? 'pending' : rollup.length > 0 ? 'passing' : 'none',
      }
    })
}

interface GhCheck {
  name?: string
  state?: string
  link?: string
}

export function parseChecks(payload: unknown): HostedCheck[] {
  if (!Array.isArray(payload)) return []
  return payload
    .filter((item): item is GhCheck => !!item && typeof item === 'object')
    .map((item) => {
      const state = String(item.state ?? '').toUpperCase()
      return {
        name: String(item.name ?? 'unknown'),
        state:
          state === 'SUCCESS' ? 'pass' : state === 'FAILURE' ? 'fail' : state === 'SKIPPED' ? 'skipped' : 'pending',
        ...(item.link ? { url: String(item.link) } : {}),
      }
    })
}

interface GhRun {
  databaseId?: number
  name?: string
  conclusion?: string
}

export function selectFailedRuns(payload: unknown, limit = 3): Array<{ id: number; name: string }> {
  if (!Array.isArray(payload)) return []
  return payload
    .filter((item): item is GhRun => !!item && typeof item === 'object')
    .filter((item) => item.conclusion === 'failure' && typeof item.databaseId === 'number')
    .slice(0, limit)
    .map((item) => ({ id: item.databaseId as number, name: String(item.name ?? 'run') }))
}

export function truncateLog(log: string, maxBytes = FAILED_LOG_BYTES): { log: string; truncated: boolean } {
  if (Buffer.byteLength(log) <= maxBytes) return { log, truncated: false }
  const buffer = Buffer.from(log)
  return { log: `…[truncated]\n${buffer.subarray(buffer.byteLength - maxBytes).toString()}`, truncated: true }
}

let authCache: { at: number; ok: boolean } | null = null
const AUTH_CACHE_MS = 5 * 60 * 1000

async function ghAuthenticated(cwd: string): Promise<boolean> {
  if (authCache && Date.now() - authCache.at < AUTH_CACHE_MS) return authCache.ok
  try {
    await runGh(cwd, ['auth', 'status'])
    authCache = { at: Date.now(), ok: true }
    return true
  } catch {
    authCache = { at: Date.now(), ok: false }
    return false
  }
}

async function githubRemote(cwd: string): Promise<boolean> {
  const url = await gitRemoteUrl(cwd, 'origin').catch(() => null)
  return !!url && parseGitRemote(url)?.host === 'github.com'
}

class GitHubProvider implements HostedProvider {
  readonly id = 'github' as const
  readonly capabilities: HostedCapability[] = ['reviews', 'checks', 'comments']

  async detect(cwd: string): Promise<boolean> {
    const [remote, auth] = await Promise.all([githubRemote(cwd), ghAuthenticated(cwd)])
    return remote && auth
  }

  async listReviews(cwd: string, branch: string): Promise<HostedReview[]> {
    const stdout = await runGh(cwd, [
      'pr', 'list', '--head', branch, '--state', 'all', '--limit', '10',
      '--json', 'number,title,isDraft,state,baseRefName,headRefName,url,statusCheckRollup',
    ])
    return parsePrList(safeJson(stdout), branch)
  }

  async getChecks(cwd: string, branch: string): Promise<HostedCheck[]> {
    const stdout = await runGh(cwd, ['pr', 'checks', branch, '--json', 'name,state,link'])
    return parseChecks(safeJson(stdout))
  }

  async getFailedLogs(cwd: string, branch: string): Promise<FailedCheckLog[]> {
    const runsJson = await runGh(cwd, [
      'run', 'list', '--branch', branch, '--limit', '10', '--json', 'databaseId,name,conclusion',
    ]).catch(() => null)
    if (!runsJson) return []
    const failed = selectFailedRuns(safeJson(runsJson))
    const logs: FailedCheckLog[] = []
    for (const run of failed) {
      try {
        const output = await runGh(cwd, ['run', 'view', String(run.id), '--log-failed'])
        const { log, truncated } = truncateLog(output)
        logs.push({ name: run.name, log, truncated })
      } catch {
        // One unreadable run must not hide the others.
      }
    }
    return logs
  }

  async createReview(
    cwd: string,
    input: { title: string; body?: string; base: string; head: string; draft?: boolean },
  ): Promise<HostedReview> {
    if (!input.title.trim()) throw new Error('PR 标题不能为空')
    const args = [
      'pr', 'create',
      '--base', input.base,
      '--head', input.head,
      '--title', input.title.trim(),
    ]
    if (input.body?.trim()) args.push('--body', input.body.trim())
    if (input.draft) args.push('--draft')
    const stdout = await runGh(cwd, args)
    const created = safeJson<{ number?: number; url?: string; title?: string }>(stdout)
    const url = created?.url ?? stdout.trim().split('\n').pop() ?? ''
    const match = /\/pull\/(\d+)/.exec(url)
    return {
      number: created?.number ?? (match ? Number(match[1]) : NaN),
      title: created?.title ?? input.title.trim(),
      state: input.draft ? 'draft' : 'open',
      base: input.base,
      head: input.head,
      url,
      checksState: 'none',
    }
  }

  async mergeReview(cwd: string, number: number, method: 'squash' | 'merge' | 'rebase' = 'squash'): Promise<{ merged: boolean }> {
    if (!Number.isFinite(number)) throw new Error(`PR 编号无效：${number}`)
    await runGh(cwd, ['pr', 'merge', String(number), `--${method}`])
    return { merged: true }
  }
}

import { GitlabProvider } from './gitlab'

const providers: HostedProvider[] = [new GitHubProvider(), new GitlabProvider()]

/** First provider that claims the checkout, or null for local-only work. */
export async function detectProvider(cwd: string): Promise<HostedProvider | null> {
  for (const provider of providers) {
    try {
      if (await provider.detect(cwd)) return provider
    } catch {
      // Detection never blocks local flows.
    }
  }
  return null
}

export function getProvider(id: HostedProviderId): HostedProvider | null {
  return providers.find((provider) => provider.id === id) ?? null
}

/** Test hook: reset the cached gh auth verdict. */
export function resetAuthCache(): void {
  authCache = null
}
