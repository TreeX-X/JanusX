import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { useGlobalToolsStore } from '@/stores/global-tools'
import { useBrowserOcclusion } from '@/hooks/useBrowserOcclusion'
import { useI18n } from '@/i18n/useI18n'
import type { WorkspacePaneNode } from '@/lib/workspace-pane'
import styles from './GlobalToolsLayout.module.css'

function projectMinimum(tree: WorkspacePaneNode | null): number {
  if (!tree || tree.type === 'leaf') return 240
  const first = projectMinimum(tree.first)
  const second = projectMinimum(tree.second)
  return tree.direction === 'horizontal'
    ? Math.max(first / tree.ratio, second / (1 - tree.ratio)) + 9
    : Math.max(first, second)
}

/** The two region containers keep their identity when a project or responsive mode changes. */
export function GlobalToolsLayout({ hasProject, projectId, projectTree, project, tools }: {
  hasProject: boolean
  projectId: string | null
  projectTree: WorkspacePaneNode | null
  project: (visible: boolean) => ReactNode
  tools: (visible: boolean) => ReactNode
}) {
  const { t } = useI18n('common')
  const paneTree = useGlobalToolsStore((s) => s.paneTree)
  const collapsed = useGlobalToolsStore((s) => s.collapsed)
  const focused = useGlobalToolsStore((s) => s.focused)
  const ratio = useGlobalToolsStore((s) => s.projectRatio)
  const setCollapsed = useGlobalToolsStore((s) => s.setCollapsed)
  const setRatio = useGlobalToolsStore((s) => s.setProjectRatio)
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [resizing, setResizing] = useState(false)
  useBrowserOcclusion(resizing)
  const minimum = projectMinimum(projectTree)
  const available = width - 9
  // Preserve the outer ratio across projects; collapse rather than move tools to fit a new tree.
  const compact = width > 0 && (available * ratio < minimum - 0.5 || available * (1 - ratio) < 319.5)
  const previousCompact = useRef<boolean | null>(null)
  const previousProject = useRef(projectId)
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    setWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (!width) return
    if (compact && !collapsed && (!focused || previousCompact.current === false || previousProject.current !== projectId) && paneTree && hasProject) setCollapsed(true)
    previousCompact.current = compact
    previousProject.current = projectId
  }, [compact, width, paneTree, hasProject, projectId, collapsed, focused, setCollapsed])

  const toolsVisible = !!paneTree && !collapsed
  const projectVisible = hasProject && !(compact && toolsVisible)
  const divided = hasProject && toolsVisible && !compact
  const minRatio = Math.max(0.2, minimum / available)
  const maxRatio = Math.min(0.8, 1 - 320 / available)
  const resize = (next: number) => setRatio(Math.max(minRatio, Math.min(maxRatio, next)))
  return (
    <div ref={root} className={styles.layout} data-global-tools-layout="" data-compact={compact}>
      <div className={styles.project} data-pane-region="project"
        style={{ display: projectVisible ? 'flex' : 'none', flex: divided ? `0 0 calc((100% - 9px) * ${ratio})` : '1' }}
        aria-hidden={!projectVisible} {...(!projectVisible ? { inert: '' } : {})}>
        {project(projectVisible)}
      </div>
      {divided && <div role="separator" tabIndex={0} className={styles.divider}
        onFocus={() => useGlobalToolsStore.getState().setFocused(true)}
        aria-label={t('common:toolGroup.resizeRegions')} aria-orientation="vertical"
        aria-valuemin={Math.round(minRatio * 100)} aria-valuemax={Math.round(maxRatio * 100)} aria-valuenow={Math.round(ratio * 100)}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          setResizing(true)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId) || !root.current) return
          resize((event.clientX - root.current.getBoundingClientRect().left - 4.5) / available)
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          setResizing(false)
        }}
        onPointerCancel={() => setResizing(false)} onLostPointerCapture={() => setResizing(false)}
        onDoubleClick={() => resize(0.62)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          event.stopPropagation()
          resize(event.key === 'Home' ? minRatio : event.key === 'End' ? maxRatio : ratio + (event.key === 'ArrowLeft' ? -0.05 : 0.05))
        }} />}
      <div className={styles.tools} data-pane-region="tools" style={{ display: toolsVisible ? 'flex' : 'none' }}
        aria-hidden={!toolsVisible} {...(!toolsVisible ? { inert: '' } : {})}
        onPointerDownCapture={() => useGlobalToolsStore.getState().setFocused(true)}>
        {tools(toolsVisible)}
      </div>
      {!!paneTree && collapsed && <div className={styles.rail}><button type="button" className={styles.toggle} data-tools-toggle=""
        aria-label={t('common:toolGroup.expandTools')} title={t('common:toolGroup.expandTools')}
        aria-expanded={false} onClick={() => setCollapsed(false)}>
        <PanelRightOpen size={14} />
      </button></div>}
    </div>
  )
}
