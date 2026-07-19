import type { RightToolDefinition, RightToolId } from './types'

export const RIGHT_TOOL_REGISTRY = [
  {
    id: 'files',
    title: '文件',
    shortTitle: '文件',
    ariaLabel: '打开文件工具',
    icon: 'files',
    order: 0,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
  {
    id: 'git',
    title: 'Git',
    shortTitle: 'Git',
    ariaLabel: '打开 Git 工具',
    icon: 'git',
    order: 1,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
  {
    id: 'checkpoints',
    title: '还原点',
    shortTitle: '还原点',
    ariaLabel: '打开还原点工具',
    icon: 'checkpoints',
    order: 2,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
  {
    id: 'assist',
    title: 'Assist',
    shortTitle: 'Assist',
    ariaLabel: '打开 Assist 工具',
    icon: 'assist',
    order: 3,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
] as const satisfies readonly RightToolDefinition[]

export const RIGHT_TOOL_IDS: readonly RightToolId[] = RIGHT_TOOL_REGISTRY.map(({ id }) => id)

const RIGHT_TOOL_ID_SET = new Set<RightToolId>(RIGHT_TOOL_IDS)

export function isRightToolId(value: unknown): value is RightToolId {
  return typeof value === 'string' && RIGHT_TOOL_ID_SET.has(value as RightToolId)
}
