import { describe, expect, it } from 'vitest'
import {
  countInboxScopes,
  filterInboxByScope,
  isUserScopeCandidate,
  type InboxCandidate,
} from '../../../src/renderer/src/components/knowledge/inboxScope'

function factCandidate(id: string, scope: string | undefined, workspaceId: string): InboxCandidate {
  return {
    id,
    type: 'fact',
    status: 'proposed',
    fact: {
      id: `fact-${id}`,
      content: id,
      concepts: [],
      files: [],
      tags: [],
      confidence: 0.5,
      version: 1,
      status: 'proposed',
      kind: 'preference',
      ...(scope === undefined ? {} : { scope }),
      provenance: {
        workspaceId,
        workspaceName: workspaceId,
        workspacePath: '',
        source: 'manual',
        sourceObservationIds: [],
        fileRefs: [],
        actor: 'test',
        createdAt: '2026-09-18T00:00:00.000Z',
      },
    },
    derivation: 'deterministic',
    evidence: { observationIds: [], snippets: [] },
  } as unknown as InboxCandidate
}

function wikiCandidate(id: string, workspaceId: string): InboxCandidate {
  return {
    id,
    type: 'wiki-patch',
    status: 'proposed',
    pageSlug: id,
    title: id,
    patchMarkdown: '',
    rationale: '',
    confidence: 0.5,
    provenance: {
      workspaceId,
      workspaceName: workspaceId,
      workspacePath: '',
      source: 'manual',
      sourceObservationIds: [],
      fileRefs: [],
      actor: 'test',
      createdAt: '2026-09-18T00:00:00.000Z',
    },
    derivation: 'deterministic',
    evidence: { observationIds: [], snippets: [] },
    sourceFactIds: [],
  } as unknown as InboxCandidate
}

describe('inbox scope split', () => {
  const userByScope = factCandidate('u1', 'user', 'ws-a')
  const userByProvenance = factCandidate('u2', undefined, 'user')
  const engineering = factCandidate('e1', undefined, 'ws-a')
  const userWiki = wikiCandidate('uw', 'user')
  const engineeringWiki = wikiCandidate('ew', 'ws-a')

  it('treats user scope or user provenance as personal, everything else as engineering', () => {
    expect(isUserScopeCandidate(userByScope)).toBe(true)
    expect(isUserScopeCandidate(userByProvenance)).toBe(true)
    expect(isUserScopeCandidate(engineering)).toBe(false)
    expect(isUserScopeCandidate(userWiki)).toBe(true)
    expect(isUserScopeCandidate(engineeringWiki)).toBe(false)
  })

  it('filters columns without dropping or duplicating rows', () => {
    const all = [userByScope, userByProvenance, engineering, userWiki, engineeringWiki]
    expect(filterInboxByScope(all, 'all')).toHaveLength(5)
    expect(filterInboxByScope(all, 'user').map((item) => item.id).sort()).toEqual(['u1', 'u2', 'uw'])
    expect(filterInboxByScope(all, 'engineering').map((item) => item.id).sort()).toEqual(['e1', 'ew'])
  })

  it('counts columns that always sum to the inbox total', () => {
    expect(countInboxScopes([userByScope, userByProvenance, engineering, userWiki, engineeringWiki])).toEqual({
      user: 3,
      engineering: 2,
    })
    expect(countInboxScopes([])).toEqual({ user: 0, engineering: 0 })
  })
})
