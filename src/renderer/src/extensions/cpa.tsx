// Note: official CPA integration uses the public workspace contribution — see .agents/notes/workbench/service-integrations.md
import { lazy, Suspense } from 'react'
import { Gauge } from 'lucide-react'
import { extensionRegistry } from './registry'
import type { ExtensionViewProps } from './types'

export const CPA_VIEW_ID = 'extension:janusx.cpa/management' as const
const CpaView = lazy(() => import('@/components/cpa/CpaView').then((module) => ({ default: module.CpaView })))

function View(props: ExtensionViewProps) {
  return <Suspense fallback={null}><CpaView {...props} /></Suspense>
}

export function registerCpaExtension(): () => void {
  return extensionRegistry.register({
    id: 'janusx.cpa',
    views: [{ id: 'management', title: 'CPA', icon: Gauge, location: 'workspace', scope: 'application', component: View }],
    activate: () => () => { void window.electron.cpa.close().catch(() => {}) },
  })
}
