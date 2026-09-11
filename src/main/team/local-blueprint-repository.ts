/**
 * @file Blueprint 本地 Repository（ToB M1）
 * @description BlueprintRepository 的单机实现：委托现有 BlueprintStore，
 *              叠加归属默认（新建即 private）与可见性/发布/基线策略。
 *              服务端实现后续挂同一接口，调用方不改。
 */

import type { Blueprint } from '../janus/types'
import { BlueprintStore, blueprintStore } from '../janus/blueprint-store'
import {
  EMPTY_SYNC_PAGE,
  isResourceVisibleTo,
  publishOwnership,
  type BlueprintCreateInput,
  type BlueprintRepository,
  type BlueprintUpdatePatch,
  type PublishTarget,
  type RepositoryActor,
  type SyncCursor,
  type SyncPage,
  type ViewerRef,
} from '../../shared/team/repository'

export class LocalBlueprintRepository implements BlueprintRepository {
  constructor(private readonly store: BlueprintStore = blueprintStore) {}

  async get(workspace: string, id: string, viewer: ViewerRef): Promise<Blueprint | null> {
    const bp = await this.store.loadBlueprint(workspace, id)
    if (!bp || !isResourceVisibleTo(bp, viewer)) return null
    return bp
  }

  async list(workspace: string, viewer: ViewerRef): Promise<Blueprint[]> {
    const all = await this.store.listBlueprints(workspace)
    return all.filter((bp) => isResourceVisibleTo(bp, viewer))
  }

  async create(workspace: string, input: BlueprintCreateInput, actor: RepositoryActor): Promise<Blueprint> {
    return this.store.createBlueprint(workspace, {
      name: input.name,
      description: input.description,
      rootTitle: input.rootTitle,
      ownership: { ownerUserId: actor.userId, tenantId: actor.tenantId ?? null },
    })
  }

  async update(
    workspace: string,
    id: string,
    patch: BlueprintUpdatePatch,
    opts: { baseVersion?: number },
    actor: RepositoryActor,
  ): Promise<Blueprint | null> {
    const current = await this.get(workspace, id, { userId: actor.userId, tenantId: actor.tenantId, projectId: actor.projectId })
    if (!current) return null
    // 归属变更必须走 publish，update 只改内容字段。
    return this.store.updateBlueprint(workspace, id, {
      ...patch,
      baseVersion: opts?.baseVersion,
      updatedBy: actor.userId,
    })
  }

  async publish(
    workspace: string,
    id: string,
    target: PublishTarget,
    actor: RepositoryActor,
  ): Promise<Blueprint | null> {
    const current = await this.store.loadBlueprint(workspace, id)
    if (!current) return null
    // M1 仅允许资源本人发布；组织角色校验随 M2 Membership 落地。
    if (current.ownerUserId && current.ownerUserId !== actor.userId) {
      throw new Error('仅资源本人可发布到团队')
    }
    const ownership = publishOwnership(current, target)
    return this.store.updateBlueprint(workspace, id, { ...ownership })
  }

  async listChanges(since: SyncCursor): Promise<SyncPage> {
    // 单机单写暂无事件日志，M4 服务端填充。游标原样返回，避免调用方误判进度。
    return { ...EMPTY_SYNC_PAGE, nextCursor: since }
  }
}

export const localBlueprintRepository = new LocalBlueprintRepository()
