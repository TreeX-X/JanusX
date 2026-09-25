// Note: GitLab self-hosted provider over instance v4 API — see
// .agents/notes/2026-09-21-gitlab-provider-reviews--640a69dd.md
import { execFile } from 'child_process'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import { promisify } from 'util'
import type {
  FailedCheckLog,
  HostedCheck,
  HostedComment,
  HostedIssue,
  HostedReview,
} from '../../shared/ipc/hosted'
import type { HostedProvider } from './github'
import { parseGitRemote } from '../git/worktrees'
import { GitlabConfigStore, apiRequestJson } from './gitlab-config'

const execFileAsync = promisify(execFile)
const FAILED_LOG_BYTES = 6 * 1024

interface GitlabMr {
  iid?: number
  title?: string
  draft?: boolean
  work_in_progress?: boolean
  state?: string
  target_branch?: string
  source_branch?: string
  web_url?: string
}

export function parseMrs(payload: unknown): HostedReview[] {
  if (!Array.isArray(payload)) return []
  return payload
    .filter((item): item is GitlabMr => !!item && typeof item === 'object')
    .filter((item) => typeof item.iid === 'number')
    .map((item) => {
      const state = String(item.state ?? '').toLowerCase()
      const draft = item.draft === true || item.work_in_progress === true
      return {
        number: item.iid as number,
        title: String(item.title ?? ''),
        state: state === 'merged' ? 'merged' : state === 'closed' ? 'closed' : draft ? 'draft' : 'open',
        base: String(item.target_branch ?? ''),
        head: String(item.source_branch ?? ''),
        url: String(item.web_url ?? ''),
        checksState: 'none' as const,
      }
    })
}

interface GitlabJob {
  id?: number
  name?: string
  status?: string
  allow_failure?: boolean
}

export function parseJobs(payload: unknown): HostedCheck[] {
  if (!Array.isArray(payload)) return []
  return payload
    .filter((item): item is GitlabJob => !!item && typeof item === 'object')
    .map((item) => {
      const status = String(item.status ?? '').toLowerCase()
      return {
        name: String(item.name ?? 'job'),
        state:
          status === 'success' || (status === 'failed' && item.allow_failure === true)
            ? 'pass'
            : status === 'failed' || status === 'canceled'
              ? 'fail'
              : status === 'skipped'
                ? 'skipped'
                : 'pending',
      }
    })
}

export function truncateLog(log: string, maxBytes = FAILED_LOG_BYTES): { log: string; truncated: boolean } {
  if (Buffer.byteLength(log) <= maxBytes) return { log, truncated: false }
  const buffer = Buffer.from(log)
  return { log: `…[truncated]\n${buffer.subarray(buffer.byteLength - maxBytes).toString()}`, truncated: true }
}

/** owner/repo to URL-encoded project path. */
interface GitlabIssue {
  iid?: number
  title?: string
  state?: string
  web_url?: string
  labels?: string[]
}

export function parseGitlabIssues(payload: unknown): HostedIssue[] {
  if (!Array.isArray(payload)) return []
  return payload
    .filter((item): item is GitlabIssue => !!item && typeof item === 'object')
    .filter((item) => typeof item.iid === 'number')
    .map((item) => ({
      number: item.iid as number,
      title: String(item.title ?? ''),
      state: String(item.state ?? '').toLowerCase() === 'closed' ? 'closed' : 'open',
      url: String(item.web_url ?? ''),
      labels: Array.isArray(item.labels) ? item.labels.map(String) : [],
    }))
}

interface GitlabNote {
  id?: number
  body?: string
  created_at?: string
  author?: { username?: string }
  position?: { new_path?: string; new_line?: number }
  system?: boolean
}

export function parseGitlabNotes(payload: unknown): HostedComment[] {
  if (!Array.isArray(payload)) return []
  return payload
    .filter((item): item is GitlabNote => !!item && typeof item === 'object')
    .filter((item) => item.system !== true && typeof item.body === 'string' && item.body.trim())
    .map((item) => ({
      id: `gl-${String(item.id ?? Math.random())}`,
      author: String(item.author?.username ?? ''),
      body: String(item.body ?? ''),
      ...(typeof item.position?.new_path === 'string' ? { path: item.position.new_path } : {}),
      ...(typeof item.position?.new_line === 'number' ? { line: item.position.new_line } : {}),
      createdAt: String(item.created_at ?? ''),
    }))
}

export function projectPath(owner: string, repo: string): string | null {
  if (!owner || !repo) return null
  return encodeURIComponent(`${owner}/${repo}`)
}

interface ResolvedInstance {
  baseUrl: string
  token: string
  timeoutMs: number
  allowInsecure: boolean
  project: string
}

async function originRemote(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd, timeout: 10000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

export class GitlabProvider implements HostedProvider {
  readonly id = 'gitlab' as const
  readonly capabilities = ['reviews', 'checks'] as HostedProvider['capabilities']

  constructor(private readonly configStore = new GitlabConfigStore()) {}

  private async resolve(cwd: string): Promise<ResolvedInstance | null> {
    const config = await this.configStore.getConfig().catch(() => null)
    if (!config?.url) return null
    const remote = await originRemote(cwd)
    const parsed = remote ? parseGitRemote(remote) : null
    if (!parsed) return null
    let instanceHost = ''
    try {
      instanceHost = new URL(config.url).hostname.toLowerCase()
    } catch {
      return null
    }
    if (parsed.host !== instanceHost) return null
    const token = await this.configStore.resolveToken().catch(() => null)
    if (!token) return null
    const project = projectPath(parsed.owner, parsed.repo)
    if (!project) return null
    return { baseUrl: config.url, token, timeoutMs: config.timeoutMs, allowInsecure: config.allowInsecure, project }
  }

  private options(resolved: ResolvedInstance) {
    return { timeoutMs: resolved.timeoutMs, allowInsecure: resolved.allowInsecure, token: resolved.token }
  }

  async detect(cwd: string): Promise<boolean> {
    const resolved = await this.resolve(cwd).catch(() => null)
    return !!resolved
  }

  async listReviews(cwd: string, branch: string): Promise<HostedReview[]> {
    const resolved = await this.resolve(cwd)
    if (!resolved) return []
    const { status, body } = await apiRequestJson<unknown>(
      'GET',
      resolved.baseUrl,
      `/projects/${resolved.project}/merge_requests?source_branch=${encodeURIComponent(branch)}&state=all&per_page=10`,
      this.options(resolved),
    ).catch(() => ({ status: 0, body: [] as unknown }))
    if (status !== 200) return []
    return parseMrs(body).filter((review) => review.head === branch)
  }

  async getChecks(cwd: string, branch: string): Promise<HostedCheck[]> {
    const resolved = await this.resolve(cwd)
    if (!resolved) return []
    const pipelines = await apiRequestJson<Array<{ id?: number }>>(
      'GET',
      resolved.baseUrl,
      `/projects/${resolved.project}/pipelines?ref=${encodeURIComponent(branch)}&per_page=3&order_by=id&sort=desc`,
      this.options(resolved),
    ).catch(() => ({ status: 0, body: [] as Array<{ id?: number }> }))
    if (pipelines.status !== 200 || pipelines.body.length === 0) return []
    const latest = pipelines.body[0]
    if (typeof latest.id !== 'number') return []
    const jobs = await apiRequestJson<unknown>(
      'GET',
      resolved.baseUrl,
      `/projects/${resolved.project}/pipelines/${latest.id}/jobs?per_page=50`,
      this.options(resolved),
    ).catch(() => ({ status: 0, body: [] as unknown }))
    if (jobs.status !== 200) return []
    return parseJobs(jobs.body)
  }

  private async jobTrace(resolved: ResolvedInstance, jobId: number): Promise<string> {
    const target = new URL(`${resolved.baseUrl}/api/v4/projects/${resolved.project}/jobs/${jobId}/trace`)
    const requestImpl = target.protocol === 'http:' ? httpRequest : httpsRequest
    return new Promise((resolvePromise, rejectPromise) => {
      const request = requestImpl(
        target,
        {
          method: 'GET',
          headers: { 'PRIVATE-TOKEN': resolved.token },
          rejectUnauthorized: !resolved.allowInsecure,
          timeout: resolved.timeoutMs,
        },
        (response) => {
          if ((response.statusCode ?? 0) !== 200) {
            rejectPromise(new Error(`trace ${response.statusCode}`))
            return
          }
          const chunks: Buffer[] = []
          response.on('data', (chunk: Buffer) => chunks.push(chunk))
          response.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
          response.on('error', rejectPromise)
        },
      )
      request.on('timeout', () => request.destroy(new Error('ETIMEDOUT')))
      request.on('error', rejectPromise)
      request.end()
    })
  }

  async getFailedLogs(cwd: string, branch: string): Promise<FailedCheckLog[]> {
    const resolved = await this.resolve(cwd)
    if (!resolved) return []
    const pipelines = await apiRequestJson<Array<{ id?: number }>>(
      'GET',
      resolved.baseUrl,
      `/projects/${resolved.project}/pipelines?ref=${encodeURIComponent(branch)}&per_page=3&order_by=id&sort=desc`,
      this.options(resolved),
    ).catch(() => ({ status: 0, body: [] as Array<{ id?: number }> }))
    if (pipelines.status !== 200) return []
    const logs: FailedCheckLog[] = []
    const latest = pipelines.body[0]
    if (!latest || typeof latest.id !== 'number') return logs
    const jobs = await apiRequestJson<Array<{ id?: number; name?: string; status?: string }>>(
      'GET',
      resolved.baseUrl,
      `/projects/${resolved.project}/pipelines/${latest.id}/jobs?per_page=50&scope[]=failed`,
      this.options(resolved),
    ).catch(() => ({ status: 0, body: [] as Array<{ id?: number; name?: string; status?: string }> }))
    if (jobs.status !== 200) return logs
    for (const job of jobs.body.slice(0, 3)) {
      if (typeof job.id !== 'number') continue
      try {
        const raw = await this.jobTrace(resolved, job.id)
        if (!raw) continue
        const { log, truncated } = truncateLog(raw)
        logs.push({ name: String(job.name ?? `job-${job.id}`), log, truncated })
      } catch {
        // One unreadable job must not hide the others.
      }
    }
    return logs
  }

  async createReview(
    cwd: string,
    input: { title: string; body?: string; base: string; head: string; draft?: boolean },
  ): Promise<HostedReview> {
    if (!input.title.trim()) throw new Error('MR 标题不能为空')
    const resolved = await this.resolve(cwd)
    if (!resolved) throw new Error('当前仓库未接入已配置的 GitLab 实例')
    const { status, body } = await apiRequestJson<{
      iid?: number
      title?: string
      web_url?: string
      message?: unknown
    }>(
      'POST',
      resolved.baseUrl,
      `/projects/${resolved.project}/merge_requests`,
      this.options(resolved),
      {
        source_branch: input.head,
        target_branch: input.base,
        title: input.title.trim(),
        ...(input.body?.trim() ? { description: input.body.trim() } : {}),
        ...(input.draft ? { draft: true } : {}),
        remove_source_branch: true,
      },
    ).catch((err: unknown) => {
      throw new Error(err instanceof Error ? err.message : String(err))
    })
    if (status < 200 || status >= 300 || typeof body.iid !== 'number') {
      const message = typeof body.message === 'string' ? body.message : `创建 MR 失败（${status}）`
      throw new Error(message)
    }
    return {
      number: body.iid,
      title: String(body.title ?? input.title.trim()),
      state: input.draft ? 'draft' : 'open',
      base: input.base,
      head: input.head,
      url: String(body.web_url ?? ''),
      checksState: 'none',
    }
  }

  async mergeReview(cwd: string, number: number, method: 'squash' | 'merge' | 'rebase' = 'squash'): Promise<{ merged: boolean }> {
    if (!Number.isFinite(number)) throw new Error(`MR 编号无效：${number}`)
    const resolved = await this.resolve(cwd)
    if (!resolved) throw new Error('当前仓库未接入已配置的 GitLab 实例')
    const { status, body } = await apiRequestJson<{ state?: string; message?: unknown }>(
      'PUT',
      resolved.baseUrl,
      `/projects/${resolved.project}/merge_requests/${number}/merge?squash=${method === 'squash'}`,
      this.options(resolved),
    ).catch((err: unknown) => {
      throw new Error(err instanceof Error ? err.message : String(err))
    })
    if (status >= 200 && status < 300) return { merged: true }
    const message = typeof body?.message === 'string' ? body.message : `合并 MR 失败（${status}）`
    throw new Error(message)
  }

  async listIssues(cwd: string, query?: string): Promise<HostedIssue[]> {
    const resolved = await this.resolve(cwd)
    if (!resolved) return []
    const params = new URLSearchParams({ state: 'opened', per_page: '20', order_by: 'updated_at', sort: 'desc' })
    if (query?.trim()) params.set('search', query.trim())
    const { status, body } = await apiRequestJson<unknown>(
      'GET',
      resolved.baseUrl,
      `/projects/${resolved.project}/issues?${params.toString()}`,
      this.options(resolved),
    ).catch(() => ({ status: 0, body: [] as unknown }))
    if (status !== 200) return []
    return parseGitlabIssues(body)
  }

  async listComments(cwd: string, number: number): Promise<HostedComment[]> {
    if (!Number.isFinite(number)) throw new Error(`MR 编号无效：${number}`)
    const resolved = await this.resolve(cwd)
    if (!resolved) return []
    const { status, body } = await apiRequestJson<unknown>(
      'GET',
      resolved.baseUrl,
      `/projects/${resolved.project}/merge_requests/${number}/notes?per_page=50&sort=asc&order_by=created_at`,
      this.options(resolved),
    ).catch(() => ({ status: 0, body: [] as unknown }))
    if (status !== 200) return []
    return parseGitlabNotes(body)
  }

  async postComment(cwd: string, number: number, comment: string): Promise<{ posted: boolean }> {
    if (!Number.isFinite(number)) throw new Error(`MR 编号无效：${number}`)
    if (!comment.trim()) throw new Error('评论内容不能为空')
    const resolved = await this.resolve(cwd)
    if (!resolved) throw new Error('当前仓库未接入已配置的 GitLab 实例')
    const { status } = await apiRequestJson<unknown>(
      'POST',
      resolved.baseUrl,
      `/projects/${resolved.project}/merge_requests/${number}/notes`,
      this.options(resolved),
      { body: comment.trim() },
    ).catch((err: unknown) => {
      throw new Error(err instanceof Error ? err.message : String(err))
    })
    if (status < 200 || status >= 300) throw new Error(`发表评论失败（${status}）`)
    return { posted: true }
  }

  async setAutoMerge(cwd: string, number: number, enable: boolean): Promise<{ autoMerge: boolean }> {
    if (!Number.isFinite(number)) throw new Error(`MR 编号无效：${number}`)
    const resolved = await this.resolve(cwd)
    if (!resolved) throw new Error('当前仓库未接入已配置的 GitLab 实例')
    if (enable) {
      const { status } = await apiRequestJson<unknown>(
        'PUT',
        resolved.baseUrl,
        `/projects/${resolved.project}/merge_requests/${number}/merge?merge_when_pipeline_succeeds=true`,
        this.options(resolved),
      ).catch((err: unknown) => {
        throw new Error(err instanceof Error ? err.message : String(err))
      })
      if (status < 200 || status >= 300) throw new Error(`设置自动合并失败（${status}）`)
      return { autoMerge: true }
    }
    const { status } = await apiRequestJson<unknown>(
      'POST',
      resolved.baseUrl,
      `/projects/${resolved.project}/merge_requests/${number}/cancel_auto_merge_when_pipeline_succeeds`,
      this.options(resolved),
    ).catch((err: unknown) => {
      throw new Error(err instanceof Error ? err.message : String(err))
    })
    if (status < 200 || status >= 300) throw new Error(`取消自动合并失败（${status}）`)
    return { autoMerge: false }
  }
}
