// Note: trusted contribution API; third-party isolation is a later stage — see .agents/notes/workbench/requirements/plugin-architecture-forms.md
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export type ExtensionViewLocation = 'workspace' | 'right'
export type ExtensionViewScope = 'application' | 'project'
export type ExtensionViewId = `extension:${string}/${string}`

export interface ExtensionViewProps {
  viewId: ExtensionViewId
  location: ExtensionViewLocation
  active: boolean
  workspaceId: string | null
  workspacePath: string | null
}

export interface ExtensionView {
  id: string
  title: string
  location: ExtensionViewLocation
  scope: ExtensionViewScope
  /** Workspace launcher; defaults to the pane's add menu. */
  launcher?: 'workspace-menu' | 'tool-menu'
  icon?: LucideIcon
  order?: number
  component: ComponentType<ExtensionViewProps>
}

export interface ExtensionDefinition {
  id: string
  views: readonly ExtensionView[]
  /** Synchronous, trusted renderer setup. Return a disposer for owned resources. */
  activate?: () => void | (() => void)
}

export interface RegisteredExtensionView extends Omit<ExtensionView, 'id'> {
  id: ExtensionViewId
  extensionId: string
  activationId: number
}
