// Note: rail plus singleton tools with shared icon taxonomy — see .agents/notes/workbench/right-dock.md
import type { RightToolDefinition, RightToolId } from './types'
import type { ExperimentalFeatures } from '../../../shared/ipc/experimental'
import { extensionRegistry, isExtensionViewId } from '@/extensions/registry'
import type { TypedI18nKey } from '@/i18n/types'

// Note: either enabled domain can use its review queue — see .agents/notes/knowledge/memory-domain-controls.md
export function isRightToolEnabled(toolId: RightToolId, features: Pick<ExperimentalFeatures, 'knowledge' | 'persona' | 'sessions'>): boolean {
  if (isExtensionViewId(toolId)) return extensionRegistry.getView(toolId)?.location === 'right'
  if (toolId === 'assist' || toolId === 'review') return features.persona
  if (toolId === 'persona') return features.persona
  if (toolId === 'sessions') return features.sessions
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
  return typeof value === 'string' && (RIGHT_TOOL_ID_SET.has(value as RightToolId)
    || (isExtensionViewId(value) && extensionRegistry.getView(value)?.location === 'right'))
}

export function getRightToolDefinitions(): readonly RightToolDefinition[] {
  return [...RIGHT_TOOL_REGISTRY, ...extensionRegistry.getSnapshot()
    .filter((view) => view.location === 'right')
    .map((view): RightToolDefinition => ({
      id: view.id, title: view.title, iconComponent: view.icon, order: view.order ?? 100,
      instancePolicy: 'single', mountPolicy: 'while-open',
    }))].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

export function rightToolLabel(
  tool: RightToolDefinition,
  translate: (key: TypedI18nKey) => string,
  kind: 'title' | 'shortTitle' | 'ariaLabel' = 'title',
): string {
  const key = kind === 'shortTitle' ? tool.shortTitleKey : kind === 'ariaLabel' ? tool.ariaLabelKey : tool.titleKey
  return key ? translate(key) : tool.title ?? tool.id
}
