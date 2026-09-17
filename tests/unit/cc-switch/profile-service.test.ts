import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => join(tmpdir(), 'janusx-test-user-data')) },
}))

const { CcSwitchProfileStore } = await import('../../../src/main/cc-switch/profile-store')
const { ClaudeSettingsApplier } = await import('../../../src/main/cc-switch/settings-applier')
const { ClaudeDetector } = await import('../../../src/main/cc-switch/claude-detector')
const { DefaultCcSwitchService } = await import('../../../src/main/cc-switch/service')

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

const INPUT = { name: 'Relay', baseURL: 'https://relay.example.com/v1', authToken: 'sk-test', model: 'm' }

async function createService() {
  const userDataDir = await createTempDir('janusx-cc-svc-store-')
  const homeDir = await createTempDir('janusx-cc-svc-home-')
  const detector = new ClaudeDetector({
    env: {},
    platform: 'linux',
    homeDir,
    isRegularFile: async () => false,
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
  })
  const service = new DefaultCcSwitchService(detector, new CcSwitchProfileStore(userDataDir), new ClaudeSettingsApplier(homeDir))
  return { service, homeDir }
}

describe('CcSwitchService profile switching', () => {
  it('activates only after a verified write and rolls back honestly', async () => {
    const { service, homeDir } = await createService()
    const saved = await service.saveProfile(INPUT)
    expect(saved.success).toBe(true)
    const id = saved.profile!.id

    // 预置一份 Live，激活才有备份可回滚。
    const { mkdir, writeFile } = await import('fs/promises')
    await mkdir(join(homeDir, '.claude'), { recursive: true })
    await writeFile(join(homeDir, '.claude', 'settings.json'), JSON.stringify({ env: { V: '0' } }), 'utf8')

    const activated = await service.activateProfile(id)
    expect(activated.success).toBe(true)
    expect(activated.activeProfileId).toBe(id)

    const live = JSON.parse(await readFile(join(homeDir, '.claude', 'settings.json'), 'utf8'))
    expect(live.env.ANTHROPIC_BASE_URL).toBe('https://relay.example.com/v1')
    await expect(service.profiles()).resolves.toMatchObject({ activeProfileId: id })

    const rolled = await service.rollbackProfile()
    expect(rolled.success).toBe(true)
    await expect(service.profiles()).resolves.toMatchObject({ activeProfileId: null })
  })

  it('rejects unknown profiles and keeps the active flag untouched on write failure', async () => {
    const { service, homeDir } = await createService()
    await expect(service.activateProfile('missing')).resolves.toMatchObject({ success: false })

    const saved = await service.saveProfile(INPUT)
    const id = saved.profile!.id
    // 首个画像保存即自动激活；写坏 Live 后激活必须失败，且激活态保持原值不动。
    const { mkdir } = await import('fs/promises')
    await mkdir(join(homeDir, '.claude'), { recursive: true })
    await writeFile(join(homeDir, '.claude', 'settings.json'), '{broken', 'utf8')

    await expect(service.activateProfile(id)).resolves.toMatchObject({ success: false })
    await expect(service.profiles()).resolves.toMatchObject({ activeProfileId: id })
  })
})
