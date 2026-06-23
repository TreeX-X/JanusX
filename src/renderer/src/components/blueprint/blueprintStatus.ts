/**
 * @file 蓝图节点状态 → 视觉映射（颜色 / 标签）
 * @description 对应 design §5.2 状态色映射。供自定义节点卡片 + 右键状态子菜单共用。
 */

import type { BlueprintNodeStatus } from '@/services/blueprint'

export interface StatusVisual {
  /** 圆点颜色 */
  color: string
  /** 中文标签 */
  label: string
}

/** 状态 → 视觉映射表（顺序即菜单展示顺序） */
export const STATUS_VISUALS: Record<BlueprintNodeStatus, StatusVisual> = {
  'not-started': { color: '#888888', label: '未开始' },
  planning: { color: '#3b82f6', label: '规划中' },
  'in-progress': { color: '#22c55e', label: '进行中' },
  testing: { color: '#eab308', label: '测试中' },
  'bug-fixing': { color: '#f97316', label: '修Bug' },
  blocked: { color: '#ef4444', label: '阻塞' },
  paused: { color: '#a855f7', label: '已暂停' },
  done: { color: '#10b981', label: '已完成' },
  archived: { color: '#555555', label: '已归档' }
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

/** 节点类型 → 简短标签 */
export const NODE_TYPE_LABEL: Record<string, string> = {
  epic: 'Epic',
  feature: 'Feature',
  task: 'Task',
  issue: 'Issue'
}
