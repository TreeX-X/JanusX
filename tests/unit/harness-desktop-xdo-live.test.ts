import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const LIVE = Boolean(process.env.JANUS_XDO_LIVE_PROVIDER) && Boolean(process.env.JANUS_XDO_LIVE_MODEL)

describe.skipIf(!LIVE)('desktop xdo live review (credential-gated acceptance)', () => {
  it('completes an accepted task against a real model review and a real commit', async () => {
    const { runGit } = await import('@janus-agent/harness-node')
    const { prepareTaskRun, startTaskRun, getTaskRun, closeoutTaskRun } = await import('../../src/main/harness/execution-adapter')
    const { executeDesktopXdo, runDesktopCommand } = await import('../../src/main/harness/desktop-executor')
    const { createModelReviewPort } = await import('../../src/main/harness/desktop-review')
    const { llmService } = await import('../../src/main/llm/LlmService')
    const { generateText } = await import('../../src/main/llm/ai-runtime')
    const { execFileSync } = await import('node:child_process')

    const REPO = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'
    const TASK_ID = '77777777-7777-4777-8777-777777777777'
    const TASK_URI = `note://${REPO}/${TASK_ID}`
    const root = await mkdtemp(join(tmpdir(), 'desktop-xdo-live-'))
    try {
      const git = (...args: string[]): void => {
        const result = runGit(root, args)
        if (!result.ok) throw new Error(result.error)
      }
      await mkdir(join(root, '.agents', 'notes'), { recursive: true })
      await mkdir(join(root, 'src'), { recursive: true })
      await writeFile(join(root, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId: REPO, name: 'Live', profile: SUPPORTED_HARNESS_PROFILE }))
      await writeFile(join(root, '.gitignore'), '.agents/.local/\n')
      await writeFile(join(root, 'src', 'value.txt'), '42')
      await writeFile(join(root, '.agents', 'notes', `2026-09-18-live--${TASK_ID.slice(0, 8)}.md`), [
        '---', 'schema: harness-note/1', `id: ${TASK_ID}`, 'kind: task', 'lifecycle: accepted', 'created: 2026-09-18',
        'work:', '  scope:', `    - repoId: ${REPO}`, "      paths: ['./']", '  acceptanceRefs:', `    - uri: ${TASK_URI}`, '      criterionId: AC-1',
        '  verification:', '    - id: V-1', '      kind: command', '      required: true', `      repoId: ${REPO}`, '      cwd: .',
        `      program: ${process.execPath}`, '      args: [\'-e\', \'process.exit(0)\']', '---', '', '# Live probe task', '',
        '## Scope', '', 'Prove live desktop execution end to end.', '', '## Acceptance criteria', '', '- [ ] AC-1: The declared check passes under live review.', '',
        '## Verification', '', 'Run the declared command, then live self-review.', '',
      ].join('\n'))
      git('init')
      git('config', 'core.autocrlf', 'false')
      git('config', 'user.name', 'test')
      git('config', 'user.email', 'test@example.invalid')
      git('add', '.')
      git('commit', '--no-gpg-sign', '-m', 'live probe task')

      const prepared = await prepareTaskRun(root, { taskRef: TASK_URI, mode: 'xdo', closeout: 'commit-required' })
      expect(prepared.errors).toEqual([])
      const started = await startTaskRun(root, prepared.data.runId, 'desktop', { by: 'desktop' })
      expect(started.errors).toEqual([])
      const providerId = process.env.JANUS_XDO_LIVE_PROVIDER as string
      const modelId = process.env.JANUS_XDO_LIVE_MODEL as string
      const executed = await executeDesktopXdo(root, prepared.data.runId, started.run?.lease?.token as string, {
        command: (step, signal) => runDesktopCommand(root, step, { signal }),
        review: createModelReviewPort(TASK_URI, started.data.attempt, {
          providerId,
          modelId,
          getModel: (provider, model) => llmService.getLanguageModel('janus', provider, model),
          generateReviewText: async (model, prompt) => {
            const result = await generateText({ model: model as never, maxSteps: 1, messages: [{ role: 'user', content: prompt }] as never })
            return (result as { text?: string }).text ?? ''
          },
        }),
      }, { implementor: 'desktop' })
      expect(executed.errors).toEqual([])
      expect(executed.data.completed).toBe(true)
      expect((await getTaskRun(root, prepared.data.runId)).run?.state).toBe('done')

      execFileSync('git', ['add', '.agents/notes', '.agents/evidence'], { cwd: root })
      execFileSync('git', ['commit', '--no-gpg-sign', '-m', 'complete live task'], { cwd: root })
      const closeout = await closeoutTaskRun(root, prepared.data.runId, { repoRoot: root })
      expect(closeout.ok).toBe(true)
      expect(closeout.data.satisfied).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
