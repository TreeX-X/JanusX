import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '' },
}))

import { BlueprintStore } from '../../src/main/janus/blueprint-store'
import { configureBlueprintDataRoot } from '../../src/main/janus/blueprint-paths'
import { LocalBlueprintRepository } from '../../src/main/team/local-blueprint-repository'
import { VersionConflictError } from '../../src/shared/team/repository'

const WS = 'test-workspace'
const alice = { userId: 'alice', tenantId: 't1', projectId: 'p1' }
const bobSameTenant = { userId: 'bob', tenantId: 't1', projectId: 'p1' }
const carolOtherTenant = { userId: 'carol', tenantId: 't2', projectId: 'p9' }
const stranger = { userId: 'stranger' }

let dataRoot: string
let repo: LocalBlueprintRepository

beforeAll(() => {
  dataRoot = mkdtempSync(join(tmpdir(), 'janusx-team-m1-'))
  configureBlueprintDataRoot(dataRoot)
})

afterAll(() => {
  configureBlueprintDataRoot(null)
  rmSync(dataRoot, { recursive: true, force: true })
})

beforeEach(() => {
  repo = new LocalBlueprintRepository(new BlueprintStore())
})

describe('M1 private-by-default', () => {
  it('新建即 private 且仅本人可见', async () => {
    const created = await repo.create(WS, { name: '私人蓝图' }, alice)
    expect(created.ownerScope).toBe('private')
    expect(created.ownerUserId).toBe('alice')

    expect(await repo.get(WS, created.id, alice)).not.toBeNull()
    expect(await repo.get(WS, created.id, stranger)).toBeNull()
    expect(await repo.list(WS, stranger)).toEqual([])
    expect(await repo.list(WS, alice)).toHaveLength(1)
  })

  it('无归属历史数据保持可见（单机兼容）', async () => {
    const store = new BlueprintStore()
    const legacy = await store.createBlueprint(WS, { name: '老蓝图' })
    expect(legacy.ownerUserId).toBeNull()
    expect(await repo.get(WS, legacy.id, stranger)).not.toBeNull()
  })
})

describe('M1 publish to team', () => {
  it('发布后同组织可见、跨组织不可见、重复发布拒绝', async () => {
    const created = await repo.create(WS, { name: '待发布' }, alice)
    const published = await repo.publish(WS, created.id, { tenantId: 't1', projectId: 'p1', updatedBy: 'alice' }, alice)
    expect(published?.ownerScope).toBe('project')
    expect(published?.tenantId).toBe('t1')

    expect(await repo.get(WS, created.id, bobSameTenant)).not.toBeNull()
    expect(await repo.get(WS, created.id, alice)).not.toBeNull()
    expect(await repo.get(WS, created.id, carolOtherTenant)).toBeNull()

    await expect(
      repo.publish(WS, created.id, { tenantId: 't1', updatedBy: 'alice' }, alice),
    ).rejects.toThrow('仅私人资源可发布到团队')
  })

  it('非本人不可发布他人私人蓝图', async () => {
    const created = await repo.create(WS, { name: '别人的' }, alice)
    await expect(
      repo.publish(WS, created.id, { tenantId: 't1', updatedBy: 'bob' }, bobSameTenant),
    ).rejects.toThrow('仅资源本人可发布到团队')
  })
})

describe('M1 baseVersion optimistic concurrency', () => {
  it('基线过期则拒绝写入且不覆盖远端', async () => {
    const created = await repo.create(WS, { name: 'v0' }, alice)
    expect(created.contentRevision).toBe(0)

    const updated = await repo.update(WS, created.id, { name: 'v1' }, { baseVersion: 0 }, alice)
    expect(updated?.name).toBe('v1')

    await expect(
      repo.update(WS, created.id, { name: 'stale-overwrite' }, { baseVersion: 0 }, alice),
    ).rejects.toBeInstanceOf(VersionConflictError)

    const current = await repo.get(WS, created.id, alice)
    expect(current?.name).toBe('v1')
  })

  it('不带基线沿用单机行为（不校验）', async () => {
    const created = await repo.create(WS, { name: 'plain' }, alice)
    const updated = await repo.update(WS, created.id, { description: 'd' }, {}, alice)
    expect(updated?.description).toBe('d')
  })
})

describe('M1 sync seam', () => {
  it('单机 listChanges 返回空页并原样回传游标', async () => {
    const result = await repo.listChanges({ lastSeq: 42 })
    expect(result).toEqual({ events: [], nextCursor: { lastSeq: 42 }, hasMore: false })
  })
})
