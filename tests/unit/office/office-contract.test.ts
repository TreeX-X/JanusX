import { describe, expect, it } from 'vitest'
import {
  OFFICE_EVENT_CHANNELS,
  OFFICE_INVOKE_CHANNELS,
  OFFICE_SKILL_IDS,
  officeError,
  officeOk,
  validateOfficeInvokeRequest,
} from '../../../src/shared/office'

describe('Office shared contract', () => {
  it('defines unique invoke and event channels', () => {
    const invokeChannels = Object.values(OFFICE_INVOKE_CHANNELS)
    const eventChannels = Object.values(OFFICE_EVENT_CHANNELS)

    expect(new Set(invokeChannels).size).toBe(invokeChannels.length)
    expect(new Set(eventChannels).size).toBe(eventChannels.length)
    expect(invokeChannels.some((channel) => (eventChannels as readonly string[]).includes(channel))).toBe(false)
  })

  it('accepts only the exact request shape for each command', () => {
    expect(validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.detect, { workspaceId: 'workspace_1' }).ok).toBe(true)
    expect(validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.detect, { workspaceId: 'workspace_1', relPath: 'a.docx' }).ok).toBe(false)
    expect(validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.startPreview, { workspaceId: 'workspace_1', relPath: 'a.docx' }).ok).toBe(true)
    expect(validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.startPreview, { workspaceId: 'workspace_1', relPath: 'a.docx', rootPath: 'C:\\secret' }).ok).toBe(false)
    expect(validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.stopPreview, { workspaceId: 'workspace_1', relPath: 'a.docx' }).ok).toBe(false)
    expect(validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.buildPrompt, { workspaceId: 'workspace_1', relPath: 'a.docx', terminalPreset: 'codex' }).ok).toBe(true)
    expect(validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.buildPrompt, { workspaceId: 'workspace_1', relPath: 'a.docx', terminalPreset: 'other' }).ok).toBe(false)
  })

  it('accepts only the promoted core OfficeCLI skill ids', () => {
    expect(OFFICE_SKILL_IDS).toEqual(['officecli-xlsx', 'officecli-docx', 'officecli-pptx'])

    for (const skillId of OFFICE_SKILL_IDS) {
      expect(validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.buildPrompt, {
        workspaceId: 'workspace_1',
        relPath: 'a.docx',
        terminalPreset: 'codex',
        skillId,
      }).ok).toBe(true)
    }

    for (const skillId of ['officecli-data-analysis', 'unknown-skill']) {
      expect(validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.buildPrompt, {
        workspaceId: 'workspace_1',
        relPath: 'a.docx',
        terminalPreset: 'codex',
        skillId,
      }).ok).toBe(false)
    }
  })

  it('uses discriminated results', () => {
    expect(officeOk('ready')).toEqual({ ok: true, value: 'ready' })
    expect(officeError('UNAVAILABLE', 'Unavailable')).toEqual({
      ok: false,
      error: { code: 'UNAVAILABLE', message: 'Unavailable' },
    })
  })
})
