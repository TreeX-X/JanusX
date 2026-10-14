import { z } from 'zod'

const id = z.string().uuid()
const title = z.string().trim().min(1).max(120)
const text = z.string().max(10000)
const legacyWorkspaceSchema = z.object({ id: z.string().min(1).max(128), name: title }).strict()
export const memoPointSchema = z.object({ id, text: text.min(1), source: z.object({ conversationId: z.string().max(128), messageId: z.string().max(128) }).strict().optional() }).strict()
export const memoNodeSchema = z.object({ id, title, label: z.string().max(120), points: z.array(memoPointSchema).max(500) }).strict()
const memoFileSchema = z.object({
  version: z.literal(3), id, title, revision: z.number().int().nonnegative(),
  createdAt: z.number().finite(), updatedAt: z.number().finite(),
  nodes: z.array(memoNodeSchema).max(100),
}).strict()
function validateMemo(memo: Pick<z.infer<typeof memoFileSchema>, 'id' | 'nodes'> & { unassigned?: z.infer<typeof memoPointSchema>[] }, ctx: z.RefinementCtx) {
  const loose = memo.unassigned ?? []
  const ids = [memo.id, ...memo.nodes.map(node => node.id), ...loose.map(point => point.id), ...memo.nodes.flatMap(node => node.points.map(point => point.id))]
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate memo identities' })
  if (loose.length + memo.nodes.reduce((sum, node) => sum + node.points.length, 0) > 500) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Memo point limit exceeded' })
}
export const memoSchema = memoFileSchema.superRefine(validateMemo)
const legacyFileSchema = memoFileSchema.extend({ version: z.union([z.literal(1), z.literal(2)]), unassigned: z.array(memoPointSchema).max(500) })

/** Validate legacy files before dropping the retired unassigned records.
 * The store persists this upgrade atomically with a new revision. */
export function readMemoFile(value: unknown): Memo {
  if (typeof value === 'object' && value !== null && 'version' in value && (value.version === 1 || value.version === 2)) {
    const schema = value.version === 1 ? legacyFileSchema.extend({ workspaces: z.array(legacyWorkspaceSchema).max(64) }) : legacyFileSchema
    const legacy = schema.superRefine(validateMemo).parse(value)
    return memoSchema.parse({ version: 3, id: legacy.id, title: legacy.title, revision: legacy.revision,
      createdAt: legacy.createdAt, updatedAt: legacy.updatedAt, nodes: legacy.nodes })
  }
  return memoSchema.parse(value)
}

export const memoOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('rename'), title }).strict(),
  z.object({ op: z.literal('addNode'), title, label: z.string().max(120).optional(), afterId: id.nullable().optional() }).strict(),
  z.object({ op: z.literal('editNode'), nodeId: id, title: title.optional(), label: z.string().max(120).optional() }).strict(),
  z.object({ op: z.literal('removeNode'), nodeId: id }).strict(),
  z.object({ op: z.literal('moveNode'), nodeId: id, afterId: id.nullable() }).strict(),
  z.object({ op: z.literal('addPoint'), nodeId: id, text: text.min(1) }).strict(),
  z.object({ op: z.literal('editPoint'), pointId: id, text: text.min(1) }).strict(),
  z.object({ op: z.literal('removePoint'), pointId: id }).strict(),
  z.object({ op: z.literal('movePoint'), pointId: id, nodeId: id, afterId: id.nullable().optional() }).strict(),
])
export const memoEditSchema = z.object({ expectedRevision: z.number().int().nonnegative(), operations: z.array(memoOperationSchema).min(1).max(40) }).strict()
export type Memo = z.infer<typeof memoSchema>
export type MemoPoint = z.infer<typeof memoPointSchema>
export type MemoOperation = z.infer<typeof memoOperationSchema>
export type MemoEdit = z.infer<typeof memoEditSchema>
export interface MemoBinding {
  memoId: string
  messageId: string
  /** UI selection captured at send time; undefined for older clients. */
  selectedNodeId?: string | null
}

export function applyMemoOperations(memo: Memo, edit: MemoEdit, makeId: () => string, source?: MemoPoint['source']): Memo {
  const parsed = memoEditSchema.parse(edit)
  if (memo.revision !== parsed.expectedRevision) throw new Error('MEMO_CONFLICT: read the current revision before editing')
  const next = structuredClone(memo)
  const node = (nodeId: string) => {
    const result = next.nodes.find(item => item.id === nodeId)
    if (!result) throw new Error('MEMO_TARGET_MISSING: node')
    return result
  }
  const points = (nodeId: string) => node(nodeId).points
  const pointList = (pointId: string) => {
    const result = next.nodes.map(item => item.points).find(list => list.some(item => item.id === pointId))
    if (!result) throw new Error('MEMO_TARGET_MISSING: point')
    return result
  }
  const insert = <T extends { id: string }>(list: T[], item: T, afterId?: string | null) => {
    if (afterId === undefined) { list.push(item); return }
    const index = afterId === null ? -1 : list.findIndex(entry => entry.id === afterId)
    if (afterId !== null && index < 0) throw new Error('MEMO_TARGET_MISSING: insertion anchor')
    list.splice(index + 1, 0, item)
  }
  for (const operation of parsed.operations) {
    switch (operation.op) {
      case 'rename': next.title = operation.title; break
      case 'addNode': insert(next.nodes, { id: makeId(), title: operation.title, label: operation.label ?? '', points: [] }, operation.afterId); break
      case 'editNode': {
        const target = node(operation.nodeId)
        if (operation.title !== undefined) target.title = operation.title
        if (operation.label !== undefined) target.label = operation.label
        break
      }
      case 'removeNode': {
        const target = node(operation.nodeId)
        next.nodes = next.nodes.filter(item => item.id !== target.id)
        break
      }
      case 'moveNode': {
        if (operation.nodeId === operation.afterId) throw new Error('Invalid node anchor')
        const target = node(operation.nodeId)
        next.nodes = next.nodes.filter(item => item.id !== target.id)
        insert(next.nodes, target, operation.afterId)
        break
      }
      case 'addPoint': points(operation.nodeId).push({ id: makeId(), text: operation.text, ...(source ? { source } : {}) }); break
      case 'editPoint': pointList(operation.pointId).find(item => item.id === operation.pointId)!.text = operation.text; break
      case 'removePoint': {
        const list = pointList(operation.pointId)
        list.splice(list.findIndex(item => item.id === operation.pointId), 1)
        break
      }
      case 'movePoint': {
        if (operation.pointId === operation.afterId) throw new Error('Invalid point anchor')
        const from = pointList(operation.pointId)
        const target = from.splice(from.findIndex(item => item.id === operation.pointId), 1)[0]
        insert(points(operation.nodeId), target, operation.afterId)
        break
      }
    }
  }
  next.revision += 1
  next.updatedAt = Date.now()
  return memoSchema.parse(next)
}
