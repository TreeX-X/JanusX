import { ipcMain } from 'electron'
import { HOSTED_CHANNELS, type CreateReviewInput, type GitlabSaveInput } from '../../shared/ipc/hosted'
import { detectProvider, getProvider } from '../hosted/github'
import { gitlabConfigStore } from '../hosted/gitlab-config'
import { worktreeMetaStore } from '../git/worktree-meta'

export function registerHostedHandlers(): void {
  ipcMain.handle(HOSTED_CHANNELS.detect, async (_event, { workspacePath }: { workspacePath: string }) => {
    const provider = await detectProvider(workspacePath)
    return provider?.id ?? null
  })

  ipcMain.handle(
    HOSTED_CHANNELS.listReviews,
    async (_event, { workspacePath, branch }: { workspacePath: string; branch: string }) => {
      const provider = await detectProvider(workspacePath)
      if (!provider) return []
      return provider.listReviews(workspacePath, branch)
    },
  )

  ipcMain.handle(
    HOSTED_CHANNELS.checks,
    async (_event, { workspacePath, branch }: { workspacePath: string; branch: string }) => {
      const provider = await detectProvider(workspacePath)
      if (!provider) return []
      return provider.getChecks(workspacePath, branch)
    },
  )

  ipcMain.handle(
    HOSTED_CHANNELS.failedLogs,
    async (_event, { workspacePath, branch }: { workspacePath: string; branch: string }) => {
      const provider = await detectProvider(workspacePath)
      if (!provider) return []
      return provider.getFailedLogs(workspacePath, branch)
    },
  )

  ipcMain.handle(HOSTED_CHANNELS.createReview, async (_event, input: CreateReviewInput) => {
    const provider = await detectProvider(input.workspacePath)
    if (!provider) throw new Error('当前仓库未接入托管平台')
    const review = await provider.createReview(input.workspacePath, {
      title: input.title,
      body: input.body,
      base: input.base,
      head: input.head,
      draft: input.draft,
    })
    // Bind the review onto the worktree meta; never fails creation.
    if (input.worktreePath && Number.isFinite(review.number)) {
      const existing = await worktreeMetaStore.get(input.worktreePath).catch(() => null)
      await worktreeMetaStore
        .set(input.worktreePath, {
          startFrom: existing?.startFrom ?? input.base,
          branch: existing?.branch ?? input.head,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          provider: provider.id,
          ...(existing?.linkedIssue ? { linkedIssue: existing.linkedIssue } : {}),
          linkedReview: review.number,
          pushTarget: `origin/${input.head}`,
        })
        .catch(() => undefined)
    }
    return review
  })

  ipcMain.handle(
    HOSTED_CHANNELS.mergeReview,
    async (
      _event,
      {
        workspacePath,
        number,
        method,
      }: { workspacePath: string; number: number; method?: 'squash' | 'merge' | 'rebase' },
    ) => {
      const provider = getProvider('github')
      if (!provider) throw new Error('GitHub 提供方不可用')
      return provider.mergeReview(workspacePath, number, method)
    },
  )

  ipcMain.handle(HOSTED_CHANNELS.gitlabGet, async () => {
    return gitlabConfigStore.getConfig()
  })

  ipcMain.handle(HOSTED_CHANNELS.gitlabSave, async (_event, input: GitlabSaveInput) => {
    return gitlabConfigStore.saveConfig(input)
  })

  ipcMain.handle(
    HOSTED_CHANNELS.gitlabVerify,
    async (_event, input?: Partial<GitlabSaveInput>) => {
      return gitlabConfigStore.verify(input)
    },
  )

  ipcMain.handle(HOSTED_CHANNELS.gitlabClearToken, async () => {
    return gitlabConfigStore.clearToken()
  })
}
