import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'

interface WorkbenchErrorBoundaryProps {
  children: ReactNode
}

export interface WorkbenchErrorBoundaryState {
  failed: boolean
  retryKey: number
}

export function retryWorkbenchErrorBoundary(
  state: WorkbenchErrorBoundaryState,
): WorkbenchErrorBoundaryState {
  return { failed: false, retryKey: state.retryKey + 1 }
}

export class WorkbenchErrorBoundary extends Component<
  WorkbenchErrorBoundaryProps,
  WorkbenchErrorBoundaryState
> {
  state: WorkbenchErrorBoundaryState = { failed: false, retryKey: 0 }

  static getDerivedStateFromError(): Partial<WorkbenchErrorBoundaryState> {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Workbench renderer failed', error, info)
  }

  retry = () => {
    this.setState(retryWorkbenchErrorBoundary)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-deep)] text-[var(--text)]" role="alert">
          <div className="text-sm font-medium">工作区渲染已中断</div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-2 rounded border border-white/15 bg-white/[0.06] px-3 text-xs hover:bg-white/10"
            onClick={this.retry}
          >
            <RotateCcw size={14} aria-hidden="true" />
            重新挂载
          </button>
        </div>
      )
    }

    return <div key={this.state.retryKey} className="h-full"><>{this.props.children}</></div>
  }
}
