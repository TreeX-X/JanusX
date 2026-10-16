import { WorkbenchErrorBoundary } from '@/components/WorkbenchErrorBoundary'
import { useExtensionViews } from './react'
import type { ExtensionViewProps } from './types'

export function ExtensionViewHost(props: ExtensionViewProps) {
  const view = useExtensionViews().find((item) => item.id === props.viewId && item.location === props.location)
  if (!view || (view.scope === 'project' && !props.workspaceId)) return null
  const View = view.component
  return (
    <WorkbenchErrorBoundary key={`${view.id}:${view.activationId}:${view.scope === 'project' ? props.workspaceId : 'application'}`}>
      <View {...props} workspaceId={view.scope === 'project' ? props.workspaceId : null}
        workspacePath={view.scope === 'project' ? props.workspacePath : null} />
    </WorkbenchErrorBoundary>
  )
}
