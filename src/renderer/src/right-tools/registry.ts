import type { RightToolDefinition, RightToolId } from './types'

export const RIGHT_TOOL_REGISTRY = [
  {
    id: 'files',
    titleKey: 'common:rightTool.tool.files.title',
    shortTitleKey: 'common:rightTool.tool.files.shortTitle',
    ariaLabelKey: 'common:rightTool.tool.files.ariaLabel',
    icon: 'files',
    order: 0,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
  {
    id: 'git',
    titleKey: 'common:rightTool.tool.git.title',
    shortTitleKey: 'common:rightTool.tool.git.shortTitle',
    ariaLabelKey: 'common:rightTool.tool.git.ariaLabel',
    icon: 'git',
    order: 1,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
  {
    id: 'checkpoints',
    titleKey: 'common:rightTool.tool.checkpoints.title',
    shortTitleKey: 'common:rightTool.tool.checkpoints.shortTitle',
    ariaLabelKey: 'common:rightTool.tool.checkpoints.ariaLabel',
    icon: 'checkpoints',
    order: 2,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
  {
    id: 'assist',
    titleKey: 'common:rightTool.tool.assist.title',
    shortTitleKey: 'common:rightTool.tool.assist.shortTitle',
    ariaLabelKey: 'common:rightTool.tool.assist.ariaLabel',
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
