import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('../../../src/main/config/service', () => ({ configService: {
  getExperimentalFeatures: async () => ({ persona: true, knowledge: true }),
  getKnowledgeSettings: async () => ({ enabled: true }),
  getPersonalMemorySettings: async () => ({ captureConversations: true, useInChat: true, inferEngineeringHabits: false, episodeTtlDays: 60 }),
} }))
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

import {
  capturePersonChatTurn,
  capturePersonEpisodeFromTurn,
} from '../../../src/main/knowledge/user-turn-capture'
import { knowledgeObservationService } from '../../../src/main/knowledge/observation-service'
import { userEpisodeService } from '../../../src/main/knowledge/user-episode-service'
import { taskNotification } from './memory-observation.fixture'

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
    expect(episodes[0]!.sourceObservationIds).toEqual([observations.find((observation) => observation.actor === 'user')!.id])
  })

  it('writes a user observation as the episode for workspace-attached turns', async () => {
    await capturePersonEpisodeFromTurn({ userText: '昨天用 pnpm 发布了新版本' })
    const observations = await knowledgeObservationService.listAll()
    expect(observations).toHaveLength(1)
    expect(observations[0]).toMatchObject({ scope: 'user', memoryIntent: 'episode' })
    const episodes = await userEpisodeService.listActive(Date.now())
    expect(episodes).toHaveLength(1)
    expect(episodes[0]!.id).toBe(observations[0]!.id)
    expect(episodes[0]!.tags).toContain('janus-chat')
  })

  it('writes nothing for empty turns and never throws', async () => {
    await expect(capturePersonChatTurn({})).resolves.toBeUndefined()
    await expect(capturePersonChatTurn({ userText: '   ' })).resolves.toBeUndefined()
    await expect(capturePersonEpisodeFromTurn({})).resolves.toBeUndefined()
    expect(await knowledgeObservationService.listAll()).toHaveLength(0)
    expect(await userEpisodeService.listActive(Date.now())).toHaveLength(0)
  })

  it('excludes pure runtime turns from personal episodes and observations, preserving mixed questions', async () => {
    for (let index = 0; index < 4; index++) {
      const userText = taskNotification(`task-${index}`)
      await capturePersonChatTurn({ userText, assistantText: 'Task complete', correlationId: `personal-${index}` })
      await capturePersonEpisodeFromTurn({ userText, correlationId: `attached-${index}` })
    }
    expect(await knowledgeObservationService.listAll()).toEqual([])
    expect(await userEpisodeService.listActive()).toEqual([])
    const mixed = `为什么出现这条通知？\n${taskNotification()}`
    await capturePersonChatTurn({ userText: mixed, correlationId: 'mixed' })
    await capturePersonEpisodeFromTurn({ userText: '<example>正常 XML</example>', correlationId: 'xml' })
    expect((await userEpisodeService.listActive()).map(episode => episode.content)).toEqual(expect.arrayContaining([mixed, '<example>正常 XML</example>']))
  })
})
