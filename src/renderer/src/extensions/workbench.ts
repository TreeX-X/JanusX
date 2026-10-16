import { useRightToolStore } from '@/stores/right-tools'
import { useWorkspaceStore } from '@/stores/workspace'
import { isRightToolEnabled } from '@/right-tools/registry'
import { useExperimentalStore } from '@/stores/experimental'
import { extensionRegistry } from './registry'
import type { ExtensionViewId } from './types'

/** Opens an enabled contribution; project views require a selected project. */
export function openExtensionView(viewId: ExtensionViewId): boolean {
  const view = extensionRegistry.getView(viewId)
  if (!view || (view.scope === 'project' && !useWorkspaceStore.getState().activeWorkspaceId)) return false
  if (view.location === 'right' && !isRightToolEnabled(viewId, useExperimentalStore.getState())) return false
  if (view.location === 'workspace') useWorkspaceStore.getState().openExtensionView(viewId)
  else useRightToolStore.getState().openTool(viewId)
  return true
}
