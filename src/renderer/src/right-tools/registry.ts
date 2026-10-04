// Note: rail plus singleton tools with shared icon taxonomy — see .agents/notes/2026-07-19-right-dock--a73f2f05.md
import type { RightToolDefinition, RightToolId } from './types'
import type { ExperimentalFeatures } from '../../../shared/ipc/experimental'

// Note: either enabled domain can use its review queue — see .agents/notes/2026-10-04-memory-domain-controls--908d675a.md
export function isRightToolEnabled(toolId: RightToolId, features: Pick<ExperimentalFeatures, 'knowledge' | 'persona'>): boolean {
  if (toolId === 'review') return features.knowledge || features.persona
  if (toolId === 'persona') return features.persona
  return true
}

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
    id: 'assist',
    titleKey: 'common:rightTool.tool.assist.title',
    shortTitleKey: 'common:rightTool.tool.assist.shortTitle',
    ariaLabelKey: 'common:rightTool.tool.assist.ariaLabel',
    icon: 'assist',
    order: 3,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
  {
    id: 'persona',
    titleKey: 'common:rightTool.tool.persona.title',
    shortTitleKey: 'common:rightTool.tool.persona.shortTitle',
    ariaLabelKey: 'common:rightTool.tool.persona.ariaLabel',
    icon: 'persona',
    order: 4,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
  {
    id: 'review',
    titleKey: 'common:rightTool.tool.review.title',
    shortTitleKey: 'common:rightTool.tool.review.shortTitle',
    ariaLabelKey: 'common:rightTool.tool.review.ariaLabel',
    icon: 'review',
    order: 5,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
  {
    id: 'sessions',
    titleKey: 'common:rightTool.tool.sessions.title',
    shortTitleKey: 'common:rightTool.tool.sessions.shortTitle',
    ariaLabelKey: 'common:rightTool.tool.sessions.ariaLabel',
    icon: 'sessions',
    order: 5,
    instancePolicy: 'single',
    mountPolicy: 'while-open',
  },
] as const satisfies readonly RightToolDefinition[]

export const RIGHT_TOOL_IDS: readonly RightToolId[] = RIGHT_TOOL_REGISTRY.map(({ id }) => id)

const RIGHT_TOOL_ID_SET = new Set<RightToolId>(RIGHT_TOOL_IDS)

export function isRightToolId(value: unknown): value is RightToolId {
  return typeof value === 'string' && RIGHT_TOOL_ID_SET.has(value as RightToolId)
}
