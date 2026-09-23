/**
 * @file 蓝图节点状态 → 视觉映射（颜色 / 标签）
 * @description 对应 design §5.2 状态色映射。供自定义节点卡片 + 右键状态子菜单共用。
 */

import type { BlueprintNodeStatus } from '@/services/blueprint'

export interface StatusVisual {
  /** 圆点颜色 */
  color: string
  /** 默认标签（迁移期保留，调用方应优先用 labelKey + t()） */
  label: string
  /** i18n key，调用方用 t(labelKey) 取本地化标签 */
  labelKey: string
}

/**
 * 状态 → 视觉映射表（顺序即菜单展示顺序）。
 * V2 设计语言：黑灰为主、橙为辅 —— 灰阶明暗表达状态，在途（in-progress）是全画布
 * 唯一的语义色（见 design/blueprint-note-graph.html）。blocked 的红色告警含义
 * 被有意收敛，与归档态以明暗区分。
 */
export const STATUS_VISUALS: Record<BlueprintNodeStatus, StatusVisual> = {
  'not-started': { color: '#3a3a3e', label: '未开始', labelKey: 'blueprint:status.notStarted' },
  planning: { color: '#55575e', label: '规划中', labelKey: 'blueprint:status.planning' },
  'in-progress': { color: '#ff7830', label: '进行中', labelKey: 'blueprint:status.inProgress' },
  testing: { color: '#8a8a8a', label: '测试中', labelKey: 'blueprint:status.testing' },
  'bug-fixing': { color: '#a1a1aa', label: '修Bug', labelKey: 'blueprint:status.bugFixing' },
  blocked: { color: '#63636b', label: '阻塞', labelKey: 'blueprint:status.blocked' },
  paused: { color: '#6b6b72', label: '已暂停', labelKey: 'blueprint:status.paused' },
  done: { color: '#d7d7db', label: '已完成', labelKey: 'blueprint:status.done' },
  archived: { color: '#4a4a4e', label: '已归档', labelKey: 'blueprint:status.archived' }
}

/** 菜单展示顺序 */
export const STATUS_ORDER: BlueprintNodeStatus[] = [
  'not-started',
  'planning',
  'in-progress',
  'testing',
  'bug-fixing',
  'blocked',
  'paused',
  'done',
  'archived'
]

/** 节点类型 → i18n key */
export const NODE_TYPE_LABEL_KEY: Record<string, string> = {
  epic: 'blueprint:nodeType.epic',
  feature: 'blueprint:nodeType.feature',
  task: 'blueprint:nodeType.task',
  issue: 'blueprint:nodeType.issue'
}

/** 节点类型 → 简短标签（迁移期保留，调用方应优先用 NODE_TYPE_LABEL_KEY + t()） */
export const NODE_TYPE_LABEL: Record<string, string> = {
  epic: 'Epic',
  feature: 'Feature',
  task: 'Task',
  issue: 'Issue'
}

/** note kind 列表（NoteDoc 原始词汇，对齐 NoteAdapter v1 与高保真 kind 过滤） */
export const NOTE_KINDS = ['initiative', 'requirement', 'task', 'decision', 'idea'] as const
export type NoteKindFilter = (typeof NOTE_KINDS)[number] | 'all'

/** note kind → i18n key（未知 kind 回退原文直显） */
export const NOTE_KIND_LABEL_KEY: Record<string, string> = {
  idea: 'blueprint:noteKind.idea',
  initiative: 'blueprint:noteKind.initiative',
  requirement: 'blueprint:noteKind.requirement',
  decision: 'blueprint:noteKind.decision',
  task: 'blueprint:noteKind.task'
}

/** type → kind 回退映射（legacy JSON 节点无 kind 透传时用；同 nodeTypeToKind 无 preferred 分支） */
const TYPE_TO_KIND_FALLBACK: Record<string, string> = {
  task: 'task',
  feature: 'requirement',
  issue: 'requirement',
  epic: 'initiative'
}

/** 节点的 note kind：harness 投影读透传值，legacy  lane 按 type 回退 */
export function noteKindOf(node: { kind?: string; type: string }): string {
  if (node.kind) return node.kind
  return TYPE_TO_KIND_FALLBACK[node.type] ?? 'idea'
}
