import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const state = vi.hoisted(() => ({ knowledge: true, persona: true, capture: true, recall: true, habits: false }))
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
vi.mock('../../../src/main/config/service', () => ({ configService: {
  getExperimentalFeatures: async () => ({ knowledge: state.knowledge, persona: state.persona }),
  getKnowledgeSettings: async () => ({ enabled: true, mode: 'deterministic-only' }),
  getPersonalMemorySettings: async () => ({ captureConversations: state.capture, useInChat: state.recall, inferEngineeringHabits: state.habits, episodeTtlDays: 30 }),
} }))
import { installMemoryDomainControls } from '../../../src/main/knowledge/memory-domain-controls'
import { KnowledgeObservationService, knowledgeObservationService, resetObservationServiceEphemeralState } from '../../../src/main/knowledge/observation-service'
import { capturePersonChatTurn } from '../../../src/main/knowledge/user-turn-capture'
import { knowledgeProcessingQueue } from '../../../src/main/knowledge/processing-queue'
import { runDeterministicStage } from '../../../src/main/knowledge/deterministic-extractor'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeContextService } from '../../../src/main/knowledge/context-service'
import { searchUserMemoryDefault } from '../../../src/main/knowledge/user-recall-service'
import { normalizePersonalMemorySettings } from '../../../src/shared/personal-memory-settings'
import { knowledgeReviewService } from '../../../src/main/knowledge/review-service'
import { reviewFixture } from './review-fixture'
let root: string
const previous = process.env.JANUSX_KNOWLEDGE_ROOT
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'memory-controls-'))
  process.env.JANUSX_KNOWLEDGE_ROOT = root
  Object.assign(state, { knowledge: true, persona: true, capture: true, recall: true, habits: false })
  resetObservationServiceEphemeralState()
  installMemoryDomainControls()
  knowledgeProcessingQueue.configureDeterministicHandler(async batch => { await runDeterministicStage(batch) })
})
afterEach(async () => {
  knowledgeProcessingQueue.dispose()
  await knowledgeProcessingQueue.processNow()
  if (previous === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
  else process.env.JANUSX_KNOWLEDGE_ROOT = previous
  await rm(root, { recursive: true, force: true })
})
const project = { workspaceId: 'project', workspacePath: 'C:/fixture', source: 'manual' as const, type: 'user-note' as const, content: '决定采用 SQLite', actor: 'user' }
it('keeps personal capture and processing available with engineering disabled, and uses the configured TTL', async () => {
  state.knowledge = false
  await expect(knowledgeObservationService.capture(project)).rejects.toThrow('memory-capture-disabled')
  await capturePersonChatTurn({ userText: '请记住我喜欢简短回答', correlationId: 'personal' })
  const records = await knowledgeObservationService.listAll()
  expect(records).toHaveLength(1)
  expect(records[0]!.workspaceId).toBe('user')
  expect(Date.parse(records[0]!.expiresAt!) - Date.parse(records[0]!.createdAt)).toBe(30 * 86400000)
  expect((await knowledgeContextService.search({ query: 'SQLite', workspaceId: 'project' })).items).toEqual([])
})
it('disables personal collection and recall without disabling engineering, and retains pending data', async () => {
  await knowledgeObservationService.capture({ ...project, workspaceId: 'user', workspacePath: 'user' }, { speaker: 'user', memoryIntent: 'remember' })
  state.persona = false
  await capturePersonChatTurn({ userText: 'must not be collected' })
  await expect(knowledgeObservationService.capture(project)).resolves.toMatchObject({ workspaceId: 'project' })
  await knowledgeProcessingQueue.processNow('user')
  expect(await knowledgeExtractService.listFactCandidates()).toEqual([])
  expect((await searchUserMemoryDefault('SQLite')).compactContext).toBe('')
  expect((await knowledgeObservationService.listAll()).filter(item => item.workspaceId === 'user')).toHaveLength(1)
  state.persona = true
  await knowledgeProcessingQueue.processNow('user')
  expect((await knowledgeExtractService.listFactCandidates()).some(candidate => candidate.id.startsWith('remember-candidate:'))).toBe(true)
})
it('turns automatic personal capture off independently while preserving explicit remember', async () => {
  state.capture = false
  await capturePersonChatTurn({ userText: 'not saved' })
  expect(await knowledgeObservationService.listAll()).toEqual([])
  await expect(knowledgeObservationService.capture({ ...project, workspaceId: 'user', workspacePath: 'user' }, { memoryIntent: 'remember', speaker: 'user' })).resolves.toMatchObject({ scope: 'user' })
  state.recall = false
  expect((await searchUserMemoryDefault('SQLite')).items).toEqual([])
})
it('normalizes retention without enabling inferred engineering habits', () => {
  expect(normalizePersonalMemorySettings()).toMatchObject({ episodeTtlDays: 60, inferEngineeringHabits: false })
  expect(normalizePersonalMemorySettings({ episodeTtlDays: 1 })).toMatchObject({ episodeTtlDays: 30 })
  expect(normalizePersonalMemorySettings({ episodeTtlDays: 999 })).toMatchObject({ episodeTtlDays: 90 })
})

it('rechecks capture authorization at commit and leaves no observation on a late disable', async () => {
  const service = new KnowledgeObservationService()
  let checks = 0
  service.configureCapturePolicy(async () => ++checks === 1)
  await expect(service.capture(project)).rejects.toThrow('memory-capture-disabled')
  expect(checks).toBe(2)
  expect(await service.listAll()).toEqual([])
})

it('gates an actual confirmed memory in recall and blocks review while personal is disabled', async () => {
  const observation = await knowledgeObservationService.capture({ ...project, workspaceId: 'user', workspacePath: 'user', content: 'My bicycle is named Bluebird.' }, { memoryIntent: 'remember', speaker: 'user' })
  await knowledgeProcessingQueue.processNow('user')
  const input = await reviewFixture({ type: 'fact', id: `remember-candidate:${observation.id}` })
  state.persona = false
  await expect(knowledgeReviewService.applyCandidate(input)).rejects.toThrow('memory-domain-disabled')
  state.persona = true
  await knowledgeReviewService.applyCandidate(input)
  expect((await searchUserMemoryDefault('Bluebird')).compactContext).toContain('Bluebird')
  state.recall = false
  expect((await searchUserMemoryDefault('Bluebird')).compactContext).toBe('')
  state.recall = true
  state.knowledge = false
  expect((await searchUserMemoryDefault('Bluebird')).compactContext).toContain('Bluebird')
})
