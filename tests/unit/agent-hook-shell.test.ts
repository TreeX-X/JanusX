import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AgentHookBridge } from '../../src/main/notifications/agent-hook-bridge'
import type { AgentHookPayload } from '../../src/main/notifications/agent-hook-types'

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => tmpdir() } }))
const { AgentHookConfigManager } = await import('../../src/main/notifications/agent-hook-config')

function findGitBash(): string | undefined {
  if (process.platform !== 'win32') return '/bin/bash'
  const git = spawnSync('where.exe', ['git.exe'], { encoding: 'utf8', windowsHide: true }).stdout?.trim().split(/\r?\n/)[0]
  return [process.env.CLAUDE_CODE_GIT_BASH_PATH, git && join(dirname(git), '..', 'bin', 'bash.exe')]
    .find((path): path is string => Boolean(path && existsSync(path)))
}

function invoke(shell: string, command: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = shell.endsWith('powershell.exe') ? ['-NoProfile', '-Command', command] : ['-c', command]
    const child = spawn(shell, args, { env, windowsHide: true, timeout: 15000 })
    const errors: Buffer[] = []
    child.stdout.resume()
    child.stderr.on('data', chunk => errors.push(chunk))
    child.on('error', reject)
    child.on('close', code => resolve({ code, stderr: Buffer.concat(errors).toString('utf8') }))
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify({ session_id: 'shell-session', prompt: '中文 hook', transcript_path: 'rollout.jsonl' }))
  })
}

describe.skipIf(process.platform !== 'win32')('native Windows hook shell delivery', () => {
  let root: string
  let homeDir: string
  const payloads: AgentHookPayload[] = []
  const bridge = new AgentHookBridge({ onPayload: payload => payloads.push(payload) })
  const bash = findGitBash()

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-shell-test-'))
    homeDir = join(root, "space and quote's $literal")
    await mkdir(homeDir)
    await bridge.start()
  })

  afterAll(async () => {
    await bridge.stop()
    if (root && dirname(root) === tmpdir()) await rm(root, { recursive: true, force: true })
  })

  for (const engine of ['codex', 'claude'] as const) {
    for (const runner of [true, false]) {
      it.skipIf(engine === 'claude' && !bash)(`${engine} delivers every configured event through its shell (${runner ? 'GUI runner' : 'fallback'})`, async () => {
        const manager = new AgentHookConfigManager({
          homeDir, userDataDir: join(homeDir, 'data'),
          windowsHookRunnerPath: runner ? undefined : null,
        })
        await manager.ensureInstalled(engine)
        const settings = JSON.parse(await readFile(
          engine === 'codex' ? manager.getCodexHooksPath() : manager.getClaudeSettingsPath(), 'utf8',
        )) as { hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>> }
        const env = { ...process.env, ...manager.buildTerminalEnv({
          engine, terminalId: `term-${engine}`, workspaceId: 'workspace',
        }, bridge.getEnv()) }
        for (const [event, entries] of Object.entries(settings.hooks)) {
          for (const entry of entries) {
            const before = payloads.length
            const result = await invoke(engine === 'codex' ? 'powershell.exe' : bash!, entry.hooks[0].command, env)
            expect(result, `${engine}:${event}`).toEqual({ code: 0, stderr: '' })
            expect(payloads.length, `${engine}:${event} must reach the bridge`).toBe(before + 1)
            expect(payloads.at(-1)).toMatchObject({
              source: engine, event, terminalId: `term-${engine}`, workspaceId: 'workspace',
              sessionId: 'shell-session', message: '中文 hook', matcher: entry.matcher ?? '',
              raw: { transcript_path: 'rollout.jsonl' },
            })
          }
        }
      }, 60000)
    }
  }
})
