import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NativeLoginService, classifyLaunchFailure } from '../../../src/main/llm/native-login'
import { NATIVE_LOGIN_CAPABILITIES, nativeLoginLaunchPlan } from '../../../src/shared/native-login'

let root: string
async function put(path: string, text: string) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text) }
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'janus-native-login-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

const service = (env: NodeJS.ProcessEnv = {}) => new NativeLoginService(root, env)

describe('native login probe', () => {
  it('reports logged-out only when the Claude credentials file is missing', async () => {
    expect(await service().getStatus('claude')).toMatchObject({ status: 'logged-out' })
    await put(join(root, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x' } }))
    expect(await service().getStatus('claude')).toMatchObject({ status: 'logged-in' })
  })

  it('degrades empty, malformed, and non-object credentials to unknown', async () => {
    const path = join(root, '.claude', '.credentials.json')
    await put(path, '')
    expect(await service().getStatus('claude')).toMatchObject({ status: 'unknown' })
    await put(path, '{ broken')
    expect(await service().getStatus('claude')).toMatchObject({ status: 'unknown' })
    await put(path, '[1, 2]')
    expect(await service().getStatus('claude')).toMatchObject({ status: 'unknown' })
    await put(path, '{}')
    expect(await service().getStatus('claude')).toMatchObject({ status: 'unknown' })
  })

  it('respects CLAUDE_CONFIG_DIR overrides like the connection projector', async () => {
    await put(join(root, 'custom-claude', '.credentials.json'), '{"a":1}')
    expect(await service({ CLAUDE_CONFIG_DIR: join(root, 'custom-claude') }).getStatus('claude')).toMatchObject({ status: 'logged-in' })
  })

  it('probes the Codex auth.json under CODEX_HOME', async () => {
    expect(await service().getStatus('codex')).toMatchObject({ status: 'logged-out' })
    await put(join(root, '.codex', 'auth.json'), '{"tokens":{"access":"t"}}')
    expect(await service().getStatus('codex')).toMatchObject({ status: 'logged-in' })
    await put(join(root, 'custom-codex', 'auth.json'), '{"tokens":{"access":"t"}}')
    expect(await service({ CODEX_HOME: join(root, 'custom-codex') }).getStatus('codex')).toMatchObject({ status: 'logged-in' })
  })

  it('probes the OpenCode auth.json under XDG_DATA_HOME', async () => {
    expect(await service().getStatus('opencode')).toMatchObject({ status: 'logged-out' })
    await put(join(root, '.local', 'share', 'opencode', 'auth.json'), '{"opencode":{"x":{"type":"oauth"}}}')
    expect(await service().getStatus('opencode')).toMatchObject({ status: 'logged-in' })
    await put(join(root, 'data', 'opencode', 'auth.json'), '{"opencode":{"x":{"type":"oauth"}}}')
    expect(await service({ XDG_DATA_HOME: join(root, 'data') }).getStatus('opencode')).toMatchObject({ status: 'logged-in' })
  })

  it('keeps pi and janus unknown with no credentials path', async () => {
    const probe = service()
    expect(await probe.getStatus('pi')).toMatchObject({ status: 'unknown' })
    expect(await probe.getStatus('janus')).toMatchObject({ status: 'unknown' })
    expect(probe.credentialsPath('pi')).toBeNull()
    expect(probe.credentialsPath('janus')).toBeNull()
  })

  it('degrades unexpected filesystem errors to unknown', async () => {
    await mkdir(join(root, '.claude', '.credentials.json'), { recursive: true })
    expect(await service().getStatus('claude')).toMatchObject({ status: 'unknown' })
  })

  it('locks the capability table shape', () => {
    expect(NATIVE_LOGIN_CAPABILITIES.claude.login).toEqual({ kind: 'tui-command', preset: 'claude', command: '/login' })
    expect(NATIVE_LOGIN_CAPABILITIES.codex.login).toEqual({ kind: 'preset-args', preset: 'codex', args: ['login'] })
    expect(NATIVE_LOGIN_CAPABILITIES.opencode.login).toEqual({ kind: 'preset-args', preset: 'opencode', args: ['auth', 'login'] })
    expect(NATIVE_LOGIN_CAPABILITIES.pi).toEqual({ detectable: false })
  })

  it('derives background login launch plans from the capability table', () => {
    expect(nativeLoginLaunchPlan('claude')).toEqual({ command: 'claude', args: [], submitLine: '/login' })
    expect(nativeLoginLaunchPlan('codex')).toEqual({ command: 'codex', args: ['login'] })
    expect(nativeLoginLaunchPlan('opencode')).toEqual({ command: 'opencode', args: ['auth', 'login'] })
    expect(nativeLoginLaunchPlan('pi')).toBeNull()
    expect(nativeLoginLaunchPlan('janus')).toBeNull()
  })

  it('classifies launch failures into short messages without URLs', () => {
    // Real shape: port-bind failure followed by an OAuth URL in the tail.
    const portFailure = classifyLaunchFailure(
      'Error logging in: socket access denied (os error 10013) '
      + 'https://auth.openai.com/oauth/authorize?code_challenge=abc&state=xyz&scope=openid+profile',
    )
    expect(portFailure).toContain('os error 10013')
    expect(portFailure).not.toContain('https://')

    // Browser closed mid-flow: no recognizable error, URL present — a calm
    // cancellation line, never the raw tail.
    const cancelled = classifyLaunchFailure(
      'Starting local login server on http://localhost:1455. '
      + 'If your browser did not open, navigate to this URL: https://auth.openai.com/oauth/authorize?state=stale '
      + 'On a remote or headless machine? Use `codex login --device-auth` instead.',
    )
    expect(cancelled).toBe('The sign-in ended before it completed. You can try again.')
    expect(cancelled).not.toContain('http')

    expect(classifyLaunchFailure('')).toBeUndefined()
    expect(classifyLaunchFailure('\x1b[?25l\x1b[2J')).toBeUndefined()

    const generic = classifyLaunchFailure('connection refused while talking to api.example.com')
    expect(generic).toContain('exited unexpectedly')
    expect(generic!.length).toBeLessThan(300)
  })
})
