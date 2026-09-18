import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { ClaudeSettingsApplier } from '../../../src/main/external-cli/settings-applier'

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'janusx-cc-apply-test-'))
}

const PROFILE = {
  baseURL: 'https://relay.example.com/v1',
  authToken: 'sk-test',
  model: 'relay-model',
}

async function writeLive(homeDir: string, content: string): Promise<string> {
  const dir = join(homeDir, '.claude')
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'settings.json')
  await writeFile(path, content, 'utf8')
  return path
}

describe('ClaudeSettingsApplier', () => {
  it('replaces only owned keys and preserves hooks, permissions, and unknown fields', async () => {
    const homeDir = await createTempDir()
    const livePath = await writeLive(homeDir, JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'https://old.example.com', KEEP_ME: '1' },
      hooks: { PreToolUse: [{ hooks: [{ command: 'echo hi' }] }] },
      permissions: { allow: ['Read'] },
      theme: 'dark',
    }))
    const applier = new ClaudeSettingsApplier(homeDir)

    const result = await applier.apply(PROFILE)
    expect(result.backupPath).toBeTruthy()

    const next = JSON.parse(await readFile(livePath, 'utf8'))
    expect(next.env).toMatchObject({
      ANTHROPIC_BASE_URL: 'https://relay.example.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-test',
      ANTHROPIC_MODEL: 'relay-model',
      KEEP_ME: '1',
    })
    expect(next.model).toBe('relay-model')
    expect(next.hooks).toBeDefined()
    expect(next.permissions).toEqual({ allow: ['Read'] })
    expect(next.theme).toBe('dark')

    const backup = JSON.parse(await readFile(result.backupPath!, 'utf8'))
    expect(backup.env.ANTHROPIC_BASE_URL).toBe('https://old.example.com')
  })

  it('leaves existing model keys untouched when the profile has no model', async () => {
    const homeDir = await createTempDir()
    const livePath = await writeLive(homeDir, JSON.stringify({ env: { ANTHROPIC_MODEL: 'keep' }, model: 'keep' }))
    const applier = new ClaudeSettingsApplier(homeDir)

    await applier.apply({ ...PROFILE, model: undefined })
    const next = JSON.parse(await readFile(livePath, 'utf8'))
    expect(next.env.ANTHROPIC_MODEL).toBe('keep')
    expect(next.model).toBe('keep')
  })

  it('creates the live file without a backup when nothing existed', async () => {
    const homeDir = await createTempDir()
    const applier = new ClaudeSettingsApplier(homeDir)

    const result = await applier.apply(PROFILE)
    expect(result.backupPath).toBeNull()
    const next = JSON.parse(await readFile(join(homeDir, '.claude', 'settings.json'), 'utf8'))
    expect(next.env.ANTHROPIC_BASE_URL).toBe('https://relay.example.com/v1')
  })

  it('refuses to overwrite malformed live JSON', async () => {
    const homeDir = await createTempDir()
    await writeLive(homeDir, '{nope')
    const applier = new ClaudeSettingsApplier(homeDir)

    await expect(applier.apply(PROFILE)).rejects.toThrow()
    expect(await readFile(join(homeDir, '.claude', 'settings.json'), 'utf8')).toBe('{nope')
  })

  it('rolls back to the newest backup and errors when none exists', async () => {
    const homeDir = await createTempDir()
    const applier = new ClaudeSettingsApplier(homeDir)
    await expect(applier.rollback()).rejects.toThrow('No backup')

    const livePath = await writeLive(homeDir, JSON.stringify({ env: { V: '1' } }))
    await applier.apply(PROFILE)
    await writeLive(homeDir, JSON.stringify({ env: { V: '2' } }))

    const rolled = await applier.rollback()
    expect(rolled.backupPath).toBeTruthy()
    expect(JSON.parse(await readFile(livePath, 'utf8'))).toEqual({ env: { V: '1' } })
  })

  it('serializes concurrent applies so the last writer wins atomically', async () => {
    const homeDir = await createTempDir()
    await writeLive(homeDir, JSON.stringify({ env: {} }))
    const applier = new ClaudeSettingsApplier(homeDir)

    await Promise.all([
      applier.apply({ ...PROFILE, baseURL: 'https://a.example.com' }),
      applier.apply({ ...PROFILE, baseURL: 'https://b.example.com' }),
    ])
    const next = JSON.parse(await readFile(join(homeDir, '.claude', 'settings.json'), 'utf8'))
    expect(['https://a.example.com', 'https://b.example.com']).toContain(next.env.ANTHROPIC_BASE_URL)
  })
})
