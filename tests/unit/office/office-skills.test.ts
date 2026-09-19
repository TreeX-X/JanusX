import { describe, expect, it, vi } from 'vitest'
import { type OfficecliInfo, type OfficeSkillId } from '../../../src/shared/office'
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
      source: 'bundled',
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

  it.each([
    [{ installed: false, compatible: false }, 'Reinstall JanusX'],
    [{ installed: true, compatible: false, version: '9.9.9' }, 'Reinstall JanusX'],
    [{ installed: true, compatible: false, runtimeError: 'Bundled OfficeCLI could not load ICU support.' }, 'ICU'],
  ] satisfies Array<[OfficecliInfo, string]>)('returns reinstall guidance for an unavailable bundled provider', async (info, expected) => {
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
})
