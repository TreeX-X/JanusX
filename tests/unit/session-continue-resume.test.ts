import { describe, expect, it } from 'vitest'
import { buildContinueResumeArgs } from '../../src/shared/ipc/session'

describe('buildContinueResumeArgs', () => {
  it('resumes internal opencode rows with a provider session id', () => {
    expect(
      buildContinueResumeArgs({ engine: 'opencode', providerSessionId: 'ses_abc' }),
    ).toEqual(['--session', 'ses_abc'])
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
      buildContinueResumeArgs({ engine: 'claude', providerSessionId: 'claude-id' }),
    ).toBeNull()
    expect(
      buildContinueResumeArgs({ engine: 'codex', providerSessionId: 'codex-id' }),
    ).toBeNull()
    expect(
      buildContinueResumeArgs({ engine: 'pi', providerSessionId: 'pi-id', transcriptPath: '/tmp/s.json' }),
    ).toBeNull()
    expect(buildContinueResumeArgs({ engine: 'shell' })).toBeNull()
  })
})
