import { Component, memo, type ErrorInfo, type ReactNode } from 'react'
import { AssistantTool } from '@/components/knowledge/AssistantTool'
import type { RightToolId } from '@/right-tools/types'
import { getRightToolView } from '@/right-tools/registry'
import { useExtensionViews } from '@/extensions/react'
import { ExtensionViewContent } from '@/extensions/ExtensionViewHost'
import { useI18n } from '@/i18n/useI18n'
import styles from './RightDock.module.css'

interface RightToolHostProps {
  openToolIds: readonly RightToolId[]
  activeToolId: RightToolId | null
  workspaceId: string | null
  workspacePath: string | null
  dockVisible: boolean
  onClose: (toolId: RightToolId) => void
}

export function RightToolHost({
  openToolIds,
  activeToolId,
  workspaceId,
  workspacePath,
  dockVisible,
  onClose,
}: RightToolHostProps) {
  useExtensionViews()
  return (
    <div className={styles.host}>
      {openToolIds.map((toolId) => {
        const active = dockVisible && activeToolId === toolId
        const view = getRightToolView(toolId)
        return (
          <section
            key={toolId}
            id={`right-tool-panel-${toolId}`}
            role="region"
            aria-labelledby={`right-tool-rail-${toolId}`}
            aria-hidden={!active}
            hidden={!active}
            {...(!active ? { inert: '' } : {})}
            className={styles.toolPanel}
          >
            <ToolErrorBoundary key={`${view?.activationId ?? 0}:${view?.scope === 'project' ? workspaceId : 'application'}`}
              toolId={toolId} onClose={() => onClose(toolId)}>
              <ToolContent
                toolId={toolId}
                view={view}
                workspaceId={workspaceId}
                workspacePath={workspacePath}
                active={active}
              />
            </ToolErrorBoundary>
          </section>
        )
      })}
    </div>
  )
}

const ToolContent = memo(function ToolContent({
  toolId,
  view,
  workspaceId,
  workspacePath,
  active,
}: {
  toolId: RightToolId
  view: ReturnType<typeof getRightToolView>
  workspaceId: string | null
  workspacePath: string | null
  active: boolean
}) {
  if (view) return <ExtensionViewContent view={view} viewId={view.id} location="right"
    active={active} workspaceId={workspaceId} workspacePath={workspacePath} />
  if (toolId === 'assist') return <AssistantTool active={active} workspaceId={workspaceId} workspacePath={workspacePath} />
  return null
})

interface ToolErrorBoundaryProps {
  toolId: RightToolId
  onClose: () => void
  children: ReactNode
}

interface ToolErrorBoundaryState {
  failed: boolean
  retryKey: number
}

export function retryToolErrorBoundary(
  state: ToolErrorBoundaryState,
): ToolErrorBoundaryState {
  return { failed: false, retryKey: state.retryKey + 1 }
}

class ToolErrorBoundary extends Component<ToolErrorBoundaryProps, ToolErrorBoundaryState> {
  state: ToolErrorBoundaryState = { failed: false, retryKey: 0 }

  static getDerivedStateFromError(): Partial<ToolErrorBoundaryState> {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Right tool ${this.props.toolId} failed`, error, info)
  }

  retry = () => {
    this.setState(retryToolErrorBoundary)
  }

  render() {
    if (this.state.failed) {
      return <ToolErrorFallback onClose={() => this.props.onClose()} onRetry={this.retry} />
    }
    return <div key={this.state.retryKey} className={styles.toolContent}>{this.props.children}</div>
  }
}

function ToolErrorFallback({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  const { t } = useI18n('common')
  return (
    <div className={styles.toolError} role="alert">
      <span>{t('common:rightTool.toolLoadFailed')}</span>
      <div>
        <button type="button" onClick={onRetry}>{t('common:action.retry')}</button>
        <button type="button" onClick={onClose}>{t('common:action.close')}</button>
      </div>
    </div>
  )
}
