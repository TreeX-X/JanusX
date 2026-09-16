import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

import {
  capturePersonChatTurn,
  capturePersonEpisodeFromTurn,
} from '../../../src/main/knowledge/user-turn-capture'
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { userEpisodeService } from '../../../src/main/knowledge/user-episode-service'

describe('Person turn capture (user memory closeout)', () => {
  const previousRoot = process.env.JANUSX_KNOWLEDGE_ROOT
  let knowledgeRoot = ''

  beforeEach(async () => {
    knowledgeRoot = await mkdtemp(join(tmpdir(), 'janusx-user-turn-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = knowledgeRoot
  })

  afterEach(async () => {
    await rm(knowledgeRoot, { recursive: true, force: true })
    if (previousRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousRoot
  })

  it('writes user plus assistant observations under the person sentinel with a linked episode', async () => {
    await capturePersonChatTurn({
      userText: '我习惯用 pnpm 而不用 npm',
      assistantText: '好的，记住了',
      sessionId: 'sess-1',
      correlationId: 'r-1',
    })
    const observations = (await knowledgeObservationService.listAll())
      .filter((observation) => observation.workspaceId === 'user')
    expect(observations).toHaveLength(2)
    expect(observations.map((observation) => observation.actor).sort()).toEqual(['assistant', 'user'])
    for (const observation of observations) {
      expect(observation.workspacePath).toBe('user')
      expect(observation.source).toBe('janus-chat')
      expect(observation.type).toBe('conversation-turn')
    }
    const episodes = await userEpisodeService.listActive(Date.now())
    expect(episodes).toHaveLength(1)
    expect(episodes[0]!.content).toBe('我习惯用 pnpm 而不用 npm')
    expect(episodes[0]!.sourceObservationIds).toHaveLength(2)
  })

  it('writes an episode without observations for workspace-attached turns', async () => {
    await capturePersonEpisodeFromTurn({ userText: '昨天用 pnpm 发布了新版本' })
    const observations = await knowledgeObservationService.listAll()
    expect(observations).toHaveLength(0)
    const episodes = await userEpisodeService.listActive(Date.now())
    expect(episodes).toHaveLength(1)
    expect(episodes[0]!.tags).toContain('janus-chat')
  })

  it('writes nothing for empty turns and never throws', async () => {
    await expect(capturePersonChatTurn({})).resolves.toBeUndefined()
    await expect(capturePersonChatTurn({ userText: '   ' })).resolves.toBeUndefined()
    await expect(capturePersonEpisodeFromTurn({})).resolves.toBeUndefined()
    expect(await knowledgeObservationService.listAll()).toHaveLength(0)
    expect(await userEpisodeService.listActive(Date.now())).toHaveLength(0)
  })
})
