import { create } from 'zustand'
import { openExtensionView } from '../workbench'
import type { ExtensionDefinition, ExtensionViewProps } from '../types'

/** Opt-in development example. All business state belongs to the extension. */
export function createWorkspaceToolsExample(): ExtensionDefinition {
  const useValues = create<{ values: Record<string, number>; increment: (key: string) => void }>((set) => ({
    values: {},
    increment: (key) => set((state) => ({ values: { ...state.values, [key]: (state.values[key] ?? 0) + 1 } })),
  }))

  function Counter({ viewId, location, workspaceId, workspacePath, active }: ExtensionViewProps) {
    const key = workspaceId ?? 'application'
    const value = useValues((state) => state.values[key] ?? 0)
    const increment = useValues((state) => state.increment)
    return (
      <div className="h-full overflow-auto p-3 text-xs" style={{ background: 'var(--shell-canvas)', color: 'var(--shell-text)' }}
        data-extension-example={location} data-view-id={viewId} data-active={active}>
        <p>{workspaceId ?? 'Application'} · {value}</p>
        {workspacePath && <p>{workspacePath}</p>}
        <button type="button" className="mt-2 rounded px-2 py-1" style={{ background: 'var(--shell-card)' }}
          onClick={() => increment(key)}>Increment</button>
        {location === 'right' && (
          <button type="button" className="mt-2 rounded px-2 py-1"
            onClick={() => openExtensionView('extension:example.tools/project')}>Open project view</button>
        )}
      </div>
    )
  }

  return {
    id: 'example.tools',
    views: [
      { id: 'overview', title: 'Example overview', location: 'workspace', scope: 'application', component: Counter },
      { id: 'project', title: 'Example project', location: 'workspace', scope: 'project', component: Counter },
      { id: 'inspector', title: 'Example inspector', location: 'right', scope: 'project', component: Counter },
    ],
  }
}
