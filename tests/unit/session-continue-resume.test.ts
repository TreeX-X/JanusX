import { describe, expect, it } from 'vitest'
import {
  buildContinueResumeArgs,
  buildProviderResumeArgs,
  buildProviderResumeCommand,
  canOfferSessionResume,
} from '../../src/shared/ipc/session'

describe('buildProviderResumeArgs', () => {
  it('spells each provider resume shape', () => {
    expect(buildProviderResumeArgs('claude', 'sess-1')).toEqual(['--resume', 'sess-1'])
    expect(buildProviderResumeArgs('codex', 'thread-1')).toEqual(['resume', 'thread-1'])
    expect(buildProviderResumeArgs('opencode', 'ses_1')).toEqual(['--session', 'ses_1'])
    expect(buildProviderResumeArgs('pi', 'sess-1', '/tmp/pi.jsonl')).toEqual(['--session', '/tmp/pi.jsonl'])
  })

  it('reports missing prerequisites as null so the panel can disable Resume', () => {
    expect(buildProviderResumeArgs('claude')).toBeNull()
    // Pi resumes from the session file, never from a bare id.
    expect(buildProviderResumeArgs('pi', 'sess-1')).toBeNull()
    expect(buildProviderResumeArgs('janus', 'sess-1')).toBeNull()
    expect(buildProviderResumeArgs('dsh', 'sess-1')).toBeNull()
  })

  it('keeps the copy command aligned with the executed argv tail', () => {
    expect(buildProviderResumeCommand('claude', 'sess-1')).toBe('claude --resume sess-1')
    expect(buildProviderResumeCommand('codex', 'thread-1')).toBe('codex resume thread-1')
    expect(buildProviderResumeCommand('opencode', 'ses_1')).toBe('opencode --session ses_1')
    expect(buildProviderResumeCommand('pi', 'sess-1', '/tmp/pi.jsonl')).toBe('pi --session /tmp/pi.jsonl')
    expect(buildProviderResumeCommand('janus', 'sess-1')).toBeNull()
    expect(buildProviderResumeCommand('claude')).toBeNull()
  })
})

describe('buildContinueResumeArgs', () => {
  it('resumes internal opencode rows with a provider session id', () => {
    expect(
      buildContinueResumeArgs({ engine: 'opencode', providerSessionId: 'ses_abc' }),
    ).toEqual(['--session', 'ses_abc'])
  })

  it('resumes Claude history when its provider session id is available', () => {
    expect(buildContinueResumeArgs({ engine: 'claude', providerSessionId: 'claude-id' }))
      .toEqual(['--resume', 'claude-id'])
  })

  it('resumes Codex instead of injecting its first prompt', () => {
    expect(buildContinueResumeArgs({ engine: 'codex', providerSessionId: ' codex-id ' }))
      .toEqual(['resume', 'codex-id'])
    expect(buildContinueResumeArgs({ engine: 'codex', providerSessionId: '  ' })).toBeNull()
  })

  it('offers native recovery on internal and archived records for the three engines', () => {
    for (const engine of ['claude', 'codex', 'opencode']) {
      expect(canOfferSessionResume({ engine, archived: false })).toBe(true)
      expect(canOfferSessionResume({ engine, archived: true })).toBe(true)
    }
    expect(canOfferSessionResume({ engine: 'pi', archived: false })).toBe(false)
    expect(canOfferSessionResume({ engine: 'pi', external: true, archived: false })).toBe(true)
    expect(canOfferSessionResume({ engine: 'pi', external: true, archived: true })).toBe(false)
  })

  it('keeps native resume when the target engine is unchanged', () => {
    expect(
      buildContinueResumeArgs({ engine: 'opencode', providerSessionId: 'ses_abc' }, 'opencode'),
    ).toEqual(['--session', 'ses_abc'])
  })

  it('falls back to handoff on engine switch', () => {
    expect(
      buildContinueResumeArgs({ engine: 'opencode', providerSessionId: 'ses_abc' }, 'claude'),
    ).toBeNull()
  })

  it('falls back to handoff without a resumable id', () => {
    expect(buildContinueResumeArgs({ engine: 'opencode' })).toBeNull()
  })

  it('keeps the handoff for engines without native internal resume', () => {
    expect(
      buildContinueResumeArgs({ engine: 'pi', providerSessionId: 'pi-id', transcriptPath: '/tmp/s.json' }),
    ).toBeNull()
    expect(buildContinueResumeArgs({ engine: 'shell' })).toBeNull()
  })
})
