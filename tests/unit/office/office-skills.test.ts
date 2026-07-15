import { describe, expect, it, vi } from 'vitest'
import { OFFICE_SKILL_IDS, type OfficecliInfo, type OfficeSkillId } from '../../../src/shared/office'
import { buildOfficePromptForAgent } from '../../../src/main/office/office-skills'

const BINARY = 'C:\\Program Files\\OfficeCLI\\officecli.exe'

function provider(info: OfficecliInfo) {
  return { detect: vi.fn(async () => info) }
}

function input(skillId?: OfficeSkillId) {
  return { terminalPreset: 'codex' as const, workspaceId: 'workspace-1', skillId }
}

describe('buildOfficePromptForAgent', () => {
  it('builds a generic prompt from the provider-verified executable', async () => {
    const result = await buildOfficePromptForAgent(input(), provider({
      installed: true,
      compatible: true,
      version: '1.0.135',
      source: 'known-location',
      path: BINARY,
    }))

    expect(result.mode).toBe('generic')
    expect(result.text).toContain('OfficeCLI exclusively')
    expect(result.text).toContain('workspace-1')
    expect(result.text).toContain('Reload from disk')
    expect(result.text).toContain(`"${BINARY}" create --help`)
    expect(result.text).toContain('active codex terminal')
  })

  it.each([
    ['officecli-xlsx', 'Excel workbook'],
    ['officecli-docx', 'Word document'],
    ['officecli-pptx', 'PowerPoint presentation'],
  ] as const)('builds the goal for %s', async (skillId, expectedGoal) => {
    const result = await buildOfficePromptForAgent(input(skillId), provider({
      installed: true,
      compatible: true,
      path: BINARY,
    }))

    expect(result.mode).toBe('specific')
    expect(result.text).toContain(expectedGoal)
  })

  it('rejects an unknown skill before probing the provider', async () => {
    const detected = provider({ installed: true, compatible: true, path: BINARY })

    await expect(buildOfficePromptForAgent(
      { ...input(), skillId: 'unknown' as OfficeSkillId },
      detected,
    )).rejects.toThrow('Invalid Office skillId')
    expect(detected.detect).not.toHaveBeenCalled()
  })

  it('supports only the three approved MVP skill ids', () => {
    expect(OFFICE_SKILL_IDS).toEqual(['officecli-xlsx', 'officecli-docx', 'officecli-pptx'])
  })

  it.each([
    [{ installed: false, compatible: false }, 'not installed'],
    [{ installed: true, compatible: false, version: '9.9.9' }, 'incompatible'],
    [{ installed: true, compatible: false, runtimeError: 'OfficeCLI could not load ICU support.' }, 'ICU'],
  ] satisfies Array<[OfficecliInfo, string]>)('returns non-executable guidance for an unavailable provider', async (info, expected) => {
    const result = await buildOfficePromptForAgent(input(), provider(info))

    expect(result.mode).toBe('guidance')
    expect(result.text).toContain(expected)
    expect(result.text).not.toContain('create --help')
    expect(result.text).not.toContain('watch --help')
    expect(result.text).not.toContain(BINARY)
  })

  it('fails closed when a provider claims compatibility without a verified path', async () => {
    const result = await buildOfficePromptForAgent(input(), provider({ installed: true, compatible: true }))

    expect(result.mode).toBe('guidance')
    expect(result.text).not.toContain('create --help')
  })

  it('uses fixed manual-install metadata without inventing an executable command', async () => {
    const result = await buildOfficePromptForAgent(input(), provider({
      installed: false,
      compatible: false,
      manualInstall: {
        repository: 'https://example.test/OfficeCLI',
        release: 'https://example.test/OfficeCLI/releases/v1.0.135',
        targetVersion: '1.0.135',
        integrity: 'sha256:test',
        windows: ['download', 'verify'],
        automaticInstallEnabled: false,
        automaticUninstallEnabled: false,
      },
    }))

    expect(result.mode).toBe('guidance')
    expect(result.text).toContain('manual installation')
    expect(result.text).toContain('https://example.test/OfficeCLI/releases/v1.0.135')
    expect(result.text).not.toContain('create --help')
    expect(result.text).not.toContain('watch --help')
  })
})
