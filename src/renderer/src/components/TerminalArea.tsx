import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import { CLITerminal } from './CLITerminal'
import type { TerminalPreset, Terminal } from '@/types'
import {
  clearTerminalDragData,
  getActiveTerminalDragId,
  hasTerminalDrag,
  hasWorkspaceFileDrag,
  readTerminalDragData,
  setTerminalDragData,
} from '@/lib/terminal-file-reference'
import {
  getLeafPanes,
  createTerminalPaneContent,
  splitPaneTree,
  type PaneDropEdge,
  type WorkspacePaneLeaf,
  type WorkspacePaneNode,
  type WorkspacePaneSplit,
} from '@/lib/workspace-pane'
import { getEstimatedContextWindow } from '@/lib/runtime-telemetry'
import { getTerminalPresetMeta, resolveTerminalLaunchCommand } from '../../../shared/terminalLaunch'

import terminalIcon from '@/assets/icons/terminal.svg'
import claudeIcon from '@/assets/icons/claude.svg'
import codexIcon from '@/assets/icons/codex.svg'
import opencodeIcon from '@/assets/icons/opencode.svg'

const PRESET_ICONS: Record<TerminalPreset, string> = {
  shell: terminalIcon,
  claude: claudeIcon,
  codex: codexIcon,
  opencode: opencodeIcon,
}

function createPreset(type: TerminalPreset): { type: TerminalPreset; name: string; icon: string } {
  return { type, name: getTerminalPresetMeta(type).label, icon: PRESET_ICONS[type] }
}

const PRESETS: { type: TerminalPreset; name: string; icon: string }[] = [
  createPreset('shell'),
  createPreset('claude'),
  createPreset('codex'),
  createPreset('opencode'),
]

const SPLIT_ZONE_MAX_PX = 240
const SPLIT_ZONE_MIN_PX = 72
const SPLIT_RATIO_MIN = 0.15
const SPLIT_RATIO_MAX = 0.85
const SPLIT_RATIO_EQUAL = 0.5

type DragHintState = PaneDropEdge | 'center'

function getPaneDropHint(element: HTMLElement, clientX: number, clientY: number): DragHintState {
  const rect = element.getBoundingClientRect()
  const maxZoneX = Math.max(0, rect.width * 0.45)
  const maxZoneY = Math.max(0, rect.height * 0.45)
  const thresholdX = Math.min(Math.max(rect.width * 0.34, SPLIT_ZONE_MIN_PX), SPLIT_ZONE_MAX_PX, maxZoneX)
  const thresholdY = Math.min(Math.max(rect.height * 0.34, SPLIT_ZONE_MIN_PX), SPLIT_ZONE_MAX_PX, maxZoneY)
  const left = clientX - rect.left
  const top = clientY - rect.top
  const right = rect.right - clientX
  const bottom = rect.bottom - clientY
  const nearest = Math.min(left, right, top, bottom)

  if (nearest === left && left <= thresholdX) return 'left'
  if (nearest === right && right <= thresholdX) return 'right'
  if (nearest === top && top <= thresholdY) return 'top'
  if (nearest === bottom && bottom <= thresholdY) return 'bottom'
  return 'center'
}

function getSplitRatioForDrag(
  _element: HTMLElement,
  _edge: Exclude<DragHintState, 'center'>,
  _clientX?: number,
  _clientY?: number
): number {
  return SPLIT_RATIO_EQUAL
}

function buildSplitPreviewTree(
  tree: WorkspacePaneNode | null,
  terminal: Terminal,
  paneId: string,
  edge: PaneDropEdge,
  ratio: number
): WorkspacePaneNode | null {
  if (!tree) return null

  const direction: 'horizontal' | 'vertical' = edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical'
  const placement = edge === 'left' || edge === 'top' ? 'before' : 'after'
  const clampedRatio = Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, ratio))
  const splitResult = splitPaneTree(
    tree,
    paneId,
    direction,
    '__preview-split',
    '__preview-pane',
    placement,
    clampedRatio
  )
  if (!splitResult.tree) return tree

  const withSource = removeTerminalFromLeafNoPrune(
    splitResult.tree,
    paneId,
    terminal.id
  )
  const content = createTerminalPaneContent(terminal.id, terminal.workspaceId)
  const targetPaneId = splitResult.focus.paneId ?? paneId
  return insertTabToLeafNoPrune(withSource, targetPaneId, content)
}

function insertTabToLeafNoPrune(
  node: WorkspacePaneNode,
  leafId: string,
  content: ReturnType<typeof createTerminalPaneContent>
): WorkspacePaneNode {
  if (node.type === 'leaf') {
    if (node.id !== leafId) return node
    const existingIndex = node.tabs.findIndex((item) => item.id === content.id)
    const tabs =
      existingIndex >= 0
        ? node.tabs.map((item) => (item.id === content.id ? content : item))
        : [...node.tabs, content]
    return {
      ...node,
      tabs,
      activeTabId: content.id,
    }
  }

  return {
    ...node,
    first: insertTabToLeafNoPrune(node.first, leafId, content),
    second: insertTabToLeafNoPrune(node.second, leafId, content),
  }
}

function removeTerminalFromLeafNoPrune(
  node: WorkspacePaneNode,
  leafId: string,
  terminalId: string
): WorkspacePaneNode {
  if (node.type === 'leaf') {
    if (node.id !== leafId) return node
    return {
      ...node,
      tabs: node.tabs.filter((item) => item.terminalId !== terminalId),
      activeTabId: node.tabs.find((item) => item.id !== node.activeTabId)?.id ?? node.tabs[0]?.id ?? null,
    }
  }

  return {
    ...node,
    first: removeTerminalFromLeafNoPrune(node.first, leafId, terminalId),
    second: removeTerminalFromLeafNoPrune(node.second, leafId, terminalId),
  }
}

function providerLabel(preset: TerminalPreset): string {
  switch (preset) {
    case 'claude':
      return 'Claude'
    case 'codex':
      return 'Codex'
    case 'opencode':
      return 'OpenCode'
    case 'shell':
      return 'Shell'
  }
}

function statusLabel(status: Terminal['status']): string {
  switch (status) {
    case 'running':
      return 'running'
    case 'exited':
      return 'done'
    default:
      return 'idle'
  }
}

function accentColor(status: Terminal['status']): string {
  return status === 'exited' ? '#4ec9b0' : status === 'running' ? '#ff7830' : '#58a6ff'
}

function formatAge(updatedAt?: number): string {
  if (!updatedAt) return 'unknown'
  const seconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000))
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h`
}

function formatTokenCount(value?: number): string {
  if (!value) return '0'
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(value)
}

function modelLabel(terminal: Terminal): string {
  if (terminal.preset === 'shell') return 'model n/a'
  return terminal.detectedModel ?? 'detecting model'
}

function contextWindow(terminal: Terminal): number | undefined {
  return terminal.contextWindowTokens ?? getEstimatedContextWindow(terminal.preset, terminal.detectedModel)
}

function contextRatio(terminal: Terminal): number | undefined {
  const windowTokens = contextWindow(terminal)
  if (!windowTokens || terminal.contextTokens === undefined) return undefined
  return Math.min(1, terminal.contextTokens / windowTokens)
}

/** 上下文渐变颜色：用量越多越红，越接近满越警告。
 *  0%   → 冷青蓝（#58a6ff，宽裕）
 *  50%  → 暖橙（#ff7830，正常）
 *  85%+ → 警告红（#ff5858，逼近上限） */
function contextRatioColor(ratio: number | undefined): string {
  if (ratio === undefined) return 'rgba(255,255,255,0.18)'
  const r = Math.max(0, Math.min(1, ratio))
  // 三段插值：[0,0.5] 青蓝→橙，[0.5,0.85] 橙→红，[0.85,1] 红加深
  if (r <= 0.5) {
    const t = r / 0.5
    return mixColor([0x58, 0xa6, 0xff], [0xff, 0x78, 0x30], t)
  }
  if (r <= 0.85) {
    const t = (r - 0.5) / 0.35
    return mixColor([0xff, 0x78, 0x30], [0xff, 0x58, 0x58], t)
  }
  const t = (r - 0.85) / 0.15
  return mixColor([0xff, 0x58, 0x58], [0xe0, 0x2b, 0x2b], t)
}

function mixColor(a: number[], b: number[], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

function contextLabel(terminal: Terminal): string {
  if (terminal.contextTokens === undefined) return 'ctx unknown'
  const used = terminal.contextTokens
  const windowTokens = contextWindow(terminal)
  if (!windowTokens) return `${formatTokenCount(used)} ctx`
  return `${formatTokenCount(used)} / ${formatTokenCount(windowTokens)} ctx`
}

function waitForTerminalMount(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

interface PaneTreeViewProps {
  node: WorkspacePaneNode | null
  terminalsById: Map<string, Terminal>
  focusedPaneId: string | null
  activeTerminalId: string | null
  isPreview?: boolean
  showFocusChrome: boolean
  onPaneFocus: (paneId: string) => void
  onTabSelect: (paneId: string, tabId: string) => void
  onCloseTab: (terminalId: string, e: React.MouseEvent) => void
  onKillTerminal: (terminalId: string, event?: React.MouseEvent) => void
  onTerminalDrop: (terminalId: string, paneId: string, edge: PaneDropEdge | null, ratio: number) => void
  onSplitPreview: (terminalId: string | null, paneId: string | null, edge: PaneDropEdge | null, ratio: number) => void
  onTerminalDragStart: (terminalId: string) => void
  onTerminalDragEnd: () => void
  activeDragTerminalId: string | null
  activeDragTerminalRef: React.MutableRefObject<string | null>
  onResize: (splitId: string, ratio: number) => void
  onOpenTerminalMenu: (position: { x: number; y: number }) => void
}

function PaneTreeView(props: PaneTreeViewProps) {
  if (!props.node) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-mono text-[#666]">
        等待加载终端...
      </div>
    )
  }

  if (props.node.type === 'split') {
    return <SplitPaneNode split={props.node} {...props} />
  }

  return <LeafPane leaf={props.node} {...props} />
}

function SplitPaneNode({ split, onResize, ...props }: PaneTreeViewProps & { split: WorkspacePaneSplit }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isHorizontal = split.direction === 'horizontal'

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const container = containerRef.current
      if (!container) return

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const rect = container.getBoundingClientRect()
        const rawRatio = isHorizontal
          ? (moveEvent.clientX - rect.left) / rect.width
          : (moveEvent.clientY - rect.top) / rect.height
        onResize(split.id, rawRatio)
      }

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [isHorizontal, onResize, split.id]
  )

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full min-h-0 min-w-0 ${isHorizontal ? 'flex-row' : 'flex-col'}`}
    >
      <div className="min-h-0 min-w-0" style={{ flexBasis: `${split.ratio * 100}%`, flexGrow: 0, flexShrink: 0 }}>
        <PaneTreeView {...props} node={split.first} onResize={onResize} />
      </div>
      <div
        role="separator"
        aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
        onPointerDown={props.isPreview ? undefined : handlePointerDown}
        className="shrink-0 transition-colors hover:bg-[rgba(255,120,48,0.28)]"
        style={{
          width: isHorizontal ? 6 : '100%',
          height: isHorizontal ? '100%' : 6,
          cursor: isHorizontal ? 'col-resize' : 'row-resize',
          background: 'rgba(255,255,255,0.045)',
        }}
      />
      <div className="min-h-0 min-w-0 flex-1">
        <PaneTreeView {...props} node={split.second} onResize={onResize} />
      </div>
    </div>
  )
}

function LeafPane({
  leaf,
  terminalsById,
  focusedPaneId,
  activeTerminalId,
  showFocusChrome,
  onPaneFocus,
  onTabSelect,
  onCloseTab,
  onKillTerminal,
  onTerminalDrop,
  onSplitPreview,
  onTerminalDragStart,
  onTerminalDragEnd,
  activeDragTerminalId,
  activeDragTerminalRef,
  onOpenTerminalMenu,
  isPreview = false,
}: PaneTreeViewProps & { leaf: WorkspacePaneLeaf }) {
  const [dragHint, setDragHint] = useState<PaneDropEdge | 'center' | null>(null)
  const lastPreviewRef = useRef(0)
  const isFocused = leaf.id === focusedPaneId
  const showFocus = showFocusChrome && isFocused
  const activeTabId = leaf.activeTabId ?? leaf.tabs[0]?.id ?? null
  const activeTab = activeTabId ? leaf.tabs.find((tab) => tab.id === activeTabId) ?? null : null
  const activeTerminal = activeTab ? terminalsById.get(activeTab.terminalId) ?? null : null

  const openMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement> | React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      onOpenTerminalMenu({
        x: rect.left,
        y: rect.bottom,
      })
    },
    [onOpenTerminalMenu]
  )

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (isPreview) return
    if (hasWorkspaceFileDrag(event.dataTransfer)) return

    const dragTerminalId =
      readTerminalDragData(event.dataTransfer) ||
      activeDragTerminalId ||
      activeDragTerminalRef.current ||
      getActiveTerminalDragId()
    if (!hasTerminalDrag(event.dataTransfer) && !dragTerminalId) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    const edge = getPaneDropHint(event.currentTarget, event.clientX, event.clientY)
    setDragHint(edge ?? 'center')
    const terminalId = dragTerminalId
    const ratio = edge === 'center' || !terminalId
      ? 0.5
      : getSplitRatioForDrag(event.currentTarget, edge, event.clientX, event.clientY)
    const now = performance.now()
    if (now - lastPreviewRef.current < 80) return
    lastPreviewRef.current = now
    onSplitPreview(
      edge === 'center' ? null : terminalId,
      edge === 'center' ? null : leaf.id,
      edge === 'center' ? null : edge,
      ratio
    )
  }, [activeDragTerminalId, isPreview, leaf.id, onSplitPreview])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (isPreview) return
    if (hasWorkspaceFileDrag(event.dataTransfer)) return

    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragHint(null)
      onSplitPreview(null, null, null, 0.5)
    }
  }, [isPreview, onSplitPreview])

  const handleDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (isPreview) return
    if (hasWorkspaceFileDrag(event.dataTransfer)) return

    const dragTerminalId =
      readTerminalDragData(event.dataTransfer) ||
      activeDragTerminalId ||
      activeDragTerminalRef.current ||
      getActiveTerminalDragId()
    if (!hasTerminalDrag(event.dataTransfer) && !dragTerminalId) return
    event.preventDefault()
    event.stopPropagation()
    const terminalId = dragTerminalId
    if (!terminalId) return
    const hint = getPaneDropHint(event.currentTarget, event.clientX, event.clientY)
    if (hint === 'center') return
    const edge: PaneDropEdge = hint
    const ratio = getSplitRatioForDrag(event.currentTarget, edge, event.clientX, event.clientY)
    setDragHint(null)
    onSplitPreview(null, null, null, 0.5)
    onTerminalDrop(terminalId, leaf.id, edge, ratio)
  }, [activeDragTerminalId, leaf.id, onTerminalDrop, onSplitPreview])

  return (
      <section
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden transition-[border-color,box-shadow,background]"
      onPointerDownCapture={() => onPaneFocus(leaf.id)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        background: showFocus ? 'rgba(24, 24, 26, 0.96)' : 'rgba(14, 14, 16, 0.92)',
        border: showFocus ? '1px solid rgba(255,120,48,0.26)' : '1px solid rgba(255,255,255,0.055)',
        boxShadow: showFocus
          ? 'inset 0 0 0 1px rgba(255,120,48,0.055)'
          : 'inset 0 1px 0 rgba(255,255,255,0.025)',
      }}
    >
      {dragHint && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background: dragHint === 'center' ? 'rgba(255,255,255,0.025)' : 'transparent',
            boxShadow:
              dragHint === 'left'
                ? 'inset 2px 0 0 rgba(255,120,48,0.55)'
                : dragHint === 'right'
                  ? 'inset -2px 0 0 rgba(255,120,48,0.55)'
                  : dragHint === 'top'
                    ? 'inset 0 2px 0 rgba(255,120,48,0.55)'
                    : dragHint === 'bottom'
                      ? 'inset 0 -2px 0 rgba(255,120,48,0.55)'
                      : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
          }}
        />
      )}
      <div
        className="flex h-9 shrink-0 items-end gap-1 overflow-x-auto px-2"
        style={{
          background: showFocus ? 'rgba(255,120,48,0.028)' : 'rgba(255,255,255,0.018)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          scrollbarWidth: 'none',
        }}
      >
        {leaf.tabs.map((tab) => {
          const terminal = terminalsById.get(tab.terminalId)
          const isActive = tab.id === activeTabId
          return (
            <button
              key={tab.id}
              type="button"
              draggable
              onDragStart={(event) => {
                setTerminalDragData(event.dataTransfer, tab.terminalId)
                onTerminalDragStart(tab.terminalId)
              }}
              onDragEnd={() => {
                setDragHint(null)
                onSplitPreview(null, null, null, 0.5)
                onTerminalDragEnd()
              }}
              onClick={() => onTabSelect(leaf.id, tab.id)}
              className="group/tab flex h-8 min-w-[112px] max-w-[190px] cursor-pointer select-none items-center gap-1.5 rounded-t-md border-0 px-2 text-left font-mono text-[11px] leading-none transition-colors"
              style={{
                color: isActive ? '#fff' : 'rgba(255,255,255,0.46)',
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                boxShadow: isActive && showFocus ? 'inset 0 -1px 0 rgba(255,120,48,0.72)' : 'none',
              }}
              title={terminal ? `${providerLabel(terminal.preset)} · ${terminal.cwd}` : tab.terminalId}
            >
              {terminal && (
                <img
                  src={PRESET_ICONS[terminal.preset]}
                  alt=""
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ opacity: isActive ? 0.95 : 0.55 }}
                />
              )}
              <span className="min-w-0 flex-1 truncate" style={{ color: isActive ? '#ffb27d' : 'inherit' }}>
                {terminal?.name ?? tab.terminalId.slice(0, 8)}
              </span>
              <span
                tabIndex={-1}
                title="Close View"
                className="ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-[13px] leading-none opacity-35 transition-[opacity,color,background] group-hover/tab:opacity-75 hover:!opacity-100 hover:bg-[rgba(255,255,255,0.1)]"
                style={{ color: '#999' }}
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseTab(tab.terminalId, event)
                }}
              >
                x
              </span>
            </button>
          )
        })}
        <div className="ml-auto flex h-8 shrink-0 items-center gap-1 pb-1">
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-[13px] leading-none font-mono"
            style={{ color: '#999', visibility: 'hidden' }}
          >
            x
          </span>
          <button
            type="button"
            title="New Terminal"
            className="flex h-6 w-7 items-center justify-center rounded border text-[12px] transition-colors hover:bg-[rgba(255,255,255,0.06)]"
            style={{ borderColor: 'rgba(255,255,255,0.08)', color: '#999' }}
            onClick={openMenu}
            onPointerDown={openMenu}
          >
            +
          </button>
          <button
            type="button"
            aria-label="结束当前终端"
            title="结束当前终端"
            disabled={!activeTerminal}
            className="flex h-6 w-6 items-center justify-center rounded border text-[14px] leading-none transition-colors enabled:hover:bg-[rgba(255,88,88,0.1)] disabled:cursor-not-allowed disabled:opacity-35"
            style={{ borderColor: 'rgba(255,255,255,0.08)', color: activeTerminal ? '#b86b6b' : '#666' }}
            onClick={(event) => activeTerminal && onKillTerminal(activeTerminal.id, event)}
          >
            -
          </button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(10, 10, 10, 0.66) 0%, rgba(2, 2, 2, 0.88) 100%)',
        }}
      >
        {leaf.tabs.map((tab) => {
          const terminal = terminalsById.get(tab.terminalId)
          if (!terminal) return null
          const isActive = tab.id === activeTabId
          const isFocusedTerminal = isFocused && terminal.id === activeTerminalId && isActive
          return (
            <div key={tab.id} className="absolute inset-0" style={{ display: isActive ? 'block' : 'none' }}>
              <CLITerminal terminalId={terminal.id} focused={isFocusedTerminal} />
            </div>
          )
        })}
        {leaf.tabs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center font-mono text-[12px] text-[#666]">
            <div>Empty pane</div>
            <button
              type="button"
              onClick={openMenu}
              onPointerDown={openMenu}
              className="rounded border px-3 py-1.5 text-[11px] transition-colors hover:bg-[rgba(255,120,48,0.08)]"
              style={{ borderColor: 'rgba(255,120,48,0.22)', color: '#ffb27d' }}
            >
              New Terminal
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

export function TerminalArea() {
  const {
    terminals,
    activeTerminalId,
    activeWorkspaceId,
    workspaces,
    terminalSnapshots,
    paneTree,
    focusedPaneId,
    addTerminal,
    setActiveTerminal,
    removeTerminal,
    updateTerminal,
    setFocusedPane,
    setPaneTab,
    collapsePaneLayout,
    resizePane,
    moveTerminalToPane,
    splitPaneWithTerminal,
  } = useWorkspaceStore()
  const setLoadState = useAppStore((s) => s.setLoadState)
  const setBlueprintMode = useAppStore((s) => s.setBlueprintMode)
  const terminalAreaRef = useRef<HTMLDivElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [ringOpen, setRingOpen] = useState(false)
  const [ringPosition, setRingPosition] = useState({ x: 0, y: 40 })
  const ringRef = useRef<HTMLDivElement>(null)
  const [previewTree, setPreviewTree] = useState<WorkspacePaneNode | null>(null)
  const [activeDragTerminalId, setActiveDragTerminalId] = useState<string | null>(null)
  const activeDragTerminalRef = useRef<string | null>(null)

  const terminalsById = useMemo(() => {
    const map = new Map<string, Terminal>()
    for (const snapshot of Object.values(terminalSnapshots)) {
      for (const terminal of snapshot.terminals) {
        map.set(terminal.id, terminal)
      }
    }
    for (const terminal of terminals) {
      map.set(terminal.id, terminal)
    }
    return map
  }, [terminalSnapshots, terminals])

  // 点击外部关闭弹出环
  useEffect(() => {
    if (!ringOpen) return
    const handler = (e: MouseEvent) => {
      if (ringRef.current && !ringRef.current.contains(e.target as Node)) {
        setRingOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ringOpen])

  useEffect(() => {
    const unsubscribe = window.electron.on('terminal:exit', (payload: unknown) => {
      const { id, exitCode } = payload as { id?: string; exitCode?: number }
      if (!id) return
      updateTerminal(id, {
        status: 'exited',
        exitCode,
        updatedAt: Date.now(),
      })
    })
    return unsubscribe
  }, [updateTerminal])

  useEffect(() => {
    if (paneTree) return
    if (terminals.length <= 1) {
      setLoadState('no-terminal')
      return
    }
    setActiveTerminal(activeTerminalId ?? terminals[0].id)
  }, [activeTerminalId, paneTree, setActiveTerminal, setLoadState, terminals])

  const handleKillTerminal = useCallback(
    async (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation()
      try {
        await window.electron.invoke('terminal:kill', { id })
      } catch {
        // ignore
      }
      removeTerminal(id)
      if (useWorkspaceStore.getState().terminals.length === 0) {
        setLoadState('no-terminal')
      }
    },
    [removeTerminal, setLoadState]
  )

  const handleTerminalDrop = useCallback(
    (terminalId: string, paneId: string, edge: PaneDropEdge | null, ratio: number) => {
      if (edge) {
        splitPaneWithTerminal(terminalId, paneId, edge, ratio)
        return
      }
      moveTerminalToPane(terminalId, paneId)
    },
    [moveTerminalToPane, splitPaneWithTerminal]
  )

  const handleSplitPreview = useCallback(
    (terminalId: string | null, paneId: string | null, edge: PaneDropEdge | null, ratio: number) => {
      if (!terminalId || !paneId || !edge) {
        setPreviewTree(null)
        return
      }

      const terminal = terminalsById.get(terminalId)
      if (!terminal) {
        setPreviewTree(null)
        return
      }

      setPreviewTree(buildSplitPreviewTree(paneTree, terminal, paneId, edge, ratio))
    },
    [paneTree, terminalsById]
  )

  useEffect(() => {
    const onDragEnd = () => {
      setPreviewTree(null)
      activeDragTerminalRef.current = null
      setActiveDragTerminalId(null)
      clearTerminalDragData()
    }
    window.addEventListener('dragend', onDragEnd)
    return () => window.removeEventListener('dragend', onDragEnd)
  }, [])

  const openTerminalMenu = useCallback((position: { x: number; y: number }) => {
    const areaRect = terminalAreaRef.current?.getBoundingClientRect()
    const xInArea = areaRect ? Math.max(0, position.x - areaRect.left) : position.x
    const yInArea = areaRect ? Math.max(0, position.y - areaRect.top) : position.y
    const menuWidth = 176
    const menuHeight = 82
    const margin = 8
    setRingPosition({
      x: Math.max(margin, Math.min(xInArea, (areaRect?.width ?? window.innerWidth) - menuWidth - margin)),
      y: Math.max(margin, Math.min(yInArea, (areaRect?.height ?? window.innerHeight) - menuHeight - margin)),
    })
    setRingOpen(true)
  }, [])

  const handlePresetSelect = useCallback(
    async (preset: typeof PRESETS[number]) => {
      setRingOpen(false)
      if (!activeWorkspaceId) return

      const workspaces = useWorkspaceStore.getState().workspaces
      const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
      if (!workspace) return

      const defaultShell = (await window.electron.invoke('system:getDefaultShell')) as string
      const terminalId = crypto.randomUUID()
      const autoCommand = resolveTerminalLaunchCommand(preset.type)
      const telemetryStartedAt = Date.now()

      const terminal: Terminal = {
        id: terminalId,
        workspaceId: activeWorkspaceId,
        name: preset.name.toLowerCase(),
        preset: preset.type,
        cwd: workspace.path,
        shell: defaultShell,
        autoCommand,
        pid: null,
        status: 'idle',
        updatedAt: telemetryStartedAt,
        telemetryStartedAt,
        contextWindowTokens: getEstimatedContextWindow(preset.type),
      }

      addTerminal(terminal)
      setBlueprintMode(false)
      setLoadState('terminal-active')
      await waitForTerminalMount()

      try {
        const result = (await window.electron.invoke('terminal:create', {
          id: terminalId,
          workspaceId: activeWorkspaceId,
          cwd: workspace.path,
          shell: defaultShell,
          autoCommand,
          preset: preset.type,
        })) as { pid: number }

        updateTerminal(terminalId, { pid: result.pid, status: 'running', updatedAt: Date.now() })
      } catch (err) {
        console.error('Failed to create terminal:', err)
        removeTerminal(terminalId)
        if (useWorkspaceStore.getState().terminals.length === 0) {
          setLoadState('no-terminal')
        }
      }
    },
    [activeWorkspaceId, addTerminal, removeTerminal, updateTerminal, setLoadState, setBlueprintMode]
  )

  const paneCount = useMemo(() => getLeafPanes(paneTree).length, [paneTree])
  const activeTerminal = activeTerminalId ? terminalsById.get(activeTerminalId) ?? null : null
  const otherTerminals = terminals.filter((terminal) => terminal.id !== activeTerminal?.id)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null
  const activeRuntimeText = activeTerminal
    ? `${providerLabel(activeTerminal.preset)} · ${statusLabel(activeTerminal.status)} · ${modelLabel(activeTerminal)} · ${contextLabel(activeTerminal)}`
    : 'No terminal runtime'

  return (
      <div
        ref={terminalAreaRef}
        className="flex flex-col h-full relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(16, 16, 18, 0.98) 0%, rgba(5, 5, 5, 1) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), inset 0 -24px 40px rgba(0,0,0,0.4)',
      }}
    >
      {paneCount > 1 && (
        <div
          className="flex h-5 shrink-0 items-center justify-end px-3 pt-1"
          style={{ background: 'rgba(10, 10, 10, 0.38)' }}
        >
          <button
            type="button"
            aria-label="取消分屏布局"
            title="取消分屏布局"
            onClick={collapsePaneLayout}
            className="flex h-4 w-5 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent font-mono text-[14px] leading-none opacity-28 transition-[opacity,background,color] hover:bg-[rgba(255,255,255,0.045)] hover:opacity-75 focus:outline-none focus:ring-1 focus:ring-[rgba(255,120,48,0.28)]"
            style={{ color: 'rgba(255,255,255,0.74)' }}
          >
            -
          </button>
        </div>
      )}

      {/* 终端类型选择弹出环 */}
      <div
        ref={ringRef}
        className="absolute z-[120] flex gap-1.5 px-3 py-2 transition-all"
        style={{
          top: `${ringPosition.y}px`,
          left: `${ringPosition.x}px`,
          background: 'rgba(18, 18, 20, 0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderRadius: '24px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.42)',
          opacity: ringOpen ? 1 : 0,
          pointerEvents: ringOpen ? 'auto' : 'none',
          transform: ringOpen ? 'translateY(0)' : 'translateY(4px)',
        }}
      >
        {PRESETS.map((preset) => (
          <div
            key={preset.type}
            onClick={() => handlePresetSelect(preset)}
            className="flex flex-col items-center gap-1 cursor-pointer transition-transform"
            style={{ transform: 'translateY(0)' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{
                border: '1.5px solid rgba(255, 255, 255, 0.08)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 120, 48, 0.4)'
                e.currentTarget.style.background = 'rgba(255, 120, 48, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <img src={preset.icon} alt={preset.name} className="w-4 h-4" />
            </div>
            <span className="text-[9px] tracking-wider" style={{ color: '#555', fontFamily: '-apple-system, sans-serif' }}>
              {preset.name}
            </span>
          </div>
        ))}
      </div>

      {/* Pane tree */}
      <div
        className="relative m-2 min-h-0 flex-1 overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(10, 10, 10, 0.6) 0%, rgba(2, 2, 2, 0.8) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
        }}
      >
        <PaneTreeView
          node={paneTree}
          terminalsById={terminalsById}
          focusedPaneId={focusedPaneId}
          activeTerminalId={activeTerminalId}
          showFocusChrome={paneCount > 1}
          onPaneFocus={setFocusedPane}
          onTabSelect={setPaneTab}
          onCloseTab={handleKillTerminal}
          onKillTerminal={handleKillTerminal}
          onTerminalDrop={handleTerminalDrop}
          onTerminalDragStart={(terminalId) => {
            activeDragTerminalRef.current = terminalId
            setActiveDragTerminalId(terminalId)
          }}
          onTerminalDragEnd={() => {
            activeDragTerminalRef.current = null
            setActiveDragTerminalId(null)
            setPreviewTree(null)
            clearTerminalDragData()
          }}
          activeDragTerminalId={activeDragTerminalId}
          activeDragTerminalRef={activeDragTerminalRef}
          onSplitPreview={handleSplitPreview}
          onResize={resizePane}
          onOpenTerminalMenu={openTerminalMenu}
        />
        {previewTree && (
          <div className="pointer-events-none absolute inset-0 z-40" style={{ background: 'rgba(2, 2, 2, 0.75)' }}>
            <PaneTreeView
              node={previewTree}
              terminalsById={terminalsById}
              focusedPaneId={focusedPaneId}
              activeTerminalId={activeTerminalId}
              showFocusChrome={paneCount > 1}
              isPreview
              onPaneFocus={setFocusedPane}
              onTabSelect={setPaneTab}
              onCloseTab={() => {}}
              onKillTerminal={() => {}}
              onTerminalDrop={() => {}}
              onTerminalDragStart={() => {}}
              onTerminalDragEnd={() => {}}
              activeDragTerminalId={null}
              activeDragTerminalRef={activeDragTerminalRef}
              onSplitPreview={() => {}}
              onResize={() => {}}
              onOpenTerminalMenu={() => {}}
            />
          </div>
        )}
      </div>

      <div
        className="flex-shrink-0 overflow-hidden transition-[height,background,border-color]"
        style={{
          background: drawerOpen ? 'rgba(11, 12, 13, 0.98)' : 'rgba(9, 10, 11, 0.96)',
          borderTop: '1px solid var(--border)',
          height: drawerOpen ? '210px' : '28px',
        }}
      >
        <button
          type="button"
          className="flex h-7 w-full cursor-pointer select-none items-center justify-between gap-3 px-3 text-left transition-colors hover:bg-[rgba(255,255,255,0.018)] focus:outline-none focus:ring-1 focus:ring-[rgba(88,166,255,0.35)]"
          onClick={() => setDrawerOpen((value) => !value)}
          aria-expanded={drawerOpen}
          aria-label="切换 Runtime 状态面板"
        >
          <div className="flex h-full min-w-0 items-center gap-1.5 text-[11px]">
            <span
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center border"
              style={{
                borderColor: 'rgba(255,120,48,0.22)',
                background: 'rgba(255,120,48,0.055)',
              }}
            >
              <span
                className="h-1.5 w-1.5 border-r-[1.5px] border-b-[1.5px] transition-transform"
                style={{
                  borderColor: '#ff7830',
                  transform: drawerOpen ? 'rotate(45deg) translate(-1px, -1px)' : 'rotate(-45deg)',
                }}
              />
            </span>
            {activeWorkspace && (
              <span
                className="inline-flex h-5 max-w-[160px] shrink-0 items-center gap-1 border px-1.5 font-mono"
                style={{
                  borderColor: 'rgba(255,120,48,0.28)',
                  background: 'rgba(255,120,48,0.1)',
                  color: '#ffb27d',
                }}
                title={`工作区：${activeWorkspace.path}`}
              >
                <span
                  className="h-[5px] w-[5px] shrink-0 rounded-full"
                  style={{ background: '#ff7830', boxShadow: '0 0 5px rgba(255,120,48,0.6)' }}
                />
                <span className="truncate">{activeWorkspace.name}</span>
              </span>
            )}
            {activeTerminal ? (
              <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                <span
                  className="inline-flex h-5 max-w-[92px] shrink-0 items-center border px-2 font-mono"
                  style={{
                    borderColor: 'rgba(255,255,255,0.055)',
                    background: 'rgba(255,255,255,0.018)',
                    color: '#d4d4d4',
                  }}
                >
                  {providerLabel(activeTerminal.preset)}
                </span>
                <span
                  className="inline-flex h-5 shrink-0 items-center border px-2 font-mono"
                  style={{
                    borderColor: `${accentColor(activeTerminal.status)}33`,
                    background: `${accentColor(activeTerminal.status)}12`,
                    color: accentColor(activeTerminal.status),
                  }}
                >
                  {statusLabel(activeTerminal.status)}
                </span>
                <span
                  className="inline-flex h-5 min-w-0 max-w-[120px] items-center border px-2 font-mono"
                  style={{
                    borderColor: 'rgba(255,255,255,0.055)',
                    background: 'rgba(255,255,255,0.014)',
                    color: '#8a8a8a',
                  }}
                >
                  <span className="truncate">{modelLabel(activeTerminal)}</span>
                </span>
                <span
                  className="hidden h-5 shrink-0 items-center border px-2 font-mono md:inline-flex"
                  style={{
                    borderColor: `${contextRatioColor(contextRatio(activeTerminal))}33`,
                    background: `${contextRatioColor(contextRatio(activeTerminal))}12`,
                    color: contextRatioColor(contextRatio(activeTerminal)),
                  }}
                >
                  {contextLabel(activeTerminal)}
                </span>
              </span>
            ) : (
              <span className="truncate font-mono text-[#666]">{activeRuntimeText}</span>
            )}
            {activeTerminal && (
              <span
                className="hidden h-1 w-20 overflow-hidden rounded-full bg-[rgba(255,255,255,0.055)] md:inline-flex"
                title={`Context estimate: ${contextLabel(activeTerminal)}`}
              >
                <span
                  className="h-full rounded-full transition-[width,background] duration-300"
                  style={{
                    width: `${Math.round((contextRatio(activeTerminal) ?? 0) * 100)}%`,
                    background: contextRatioColor(contextRatio(activeTerminal)),
                  }}
                />
              </span>
            )}
          </div>
          <div className="flex h-full shrink-0 items-center gap-2 text-[10px]">
            <div className="hidden h-full items-center gap-1.5 md:flex">
              {otherTerminals.slice(0, 3).map((terminal) => (
                <span
                  key={terminal.id}
                  className="inline-flex h-5 max-w-[126px] items-center gap-1.5 overflow-hidden border px-1.5 font-mono"
                  style={{
                    borderColor: 'rgba(255,255,255,0.055)',
                    background: 'rgba(255,255,255,0.018)',
                    color: '#777',
                  }}
                  title={`${providerLabel(terminal.preset)} · ${statusLabel(terminal.status)} · ${modelLabel(terminal)} · ${contextLabel(terminal)}`}
                >
                  <span
                    className="h-[5px] w-[5px] shrink-0 rounded-full"
                    style={{ background: accentColor(terminal.status) }}
                  />
                  <span className="truncate">{providerLabel(terminal.preset)}</span>
                </span>
              ))}
              {otherTerminals.length > 3 && (
                <span className="inline-flex h-5 items-center border border-[rgba(255,255,255,0.055)] px-1.5 font-mono text-[#555]">
                  +{otherTerminals.length - 3}
                </span>
              )}
            </div>
          </div>
        </button>
        {drawerOpen && (
          <div
            className="overflow-hidden px-3 pb-3 pt-2 text-[11px] font-mono"
            style={{ height: 'calc(100% - 28px)' }}
          >
            <section
              className="min-h-0 overflow-hidden border"
              style={{
                borderColor: 'rgba(255,120,48,0.12)',
                background: 'linear-gradient(180deg, rgba(255,120,48,0.035), rgba(255,255,255,0.01))',
              }}
              aria-label="Runtime telemetry"
            >
              <div className="flex h-8 items-center justify-between border-b px-2.5" style={{ borderColor: 'rgba(255,120,48,0.12)' }}>
                <span className="text-[#ffb27d]">Terminal Runtime</span>
                <span className="text-[#666]">{terminals.length} sessions</span>
              </div>
              <div className="max-h-[141px] overflow-auto">
                {terminals.length === 0 ? (
                  <div className="px-2.5 py-4 text-[#555]">暂无终端运行数据</div>
                ) : (
                  terminals.map((terminal) => (
                    <button
                      key={terminal.id}
                      type="button"
                      className="grid w-full cursor-pointer grid-cols-[92px_74px_minmax(96px,140px)_minmax(140px,1fr)_86px] items-center gap-2 border-b px-2.5 py-2 text-left transition-colors hover:bg-[rgba(255,120,48,0.045)] focus:outline-none focus:ring-1 focus:ring-[rgba(255,120,48,0.35)]"
                      style={{
                        borderColor: 'rgba(255,255,255,0.035)',
                        background: terminal.id === activeTerminalId ? 'rgba(255,120,48,0.055)' : 'transparent',
                      }}
                      onClick={() => setActiveTerminal(terminal.id)}
                      title={`${providerLabel(terminal.preset)} · ${terminal.cwd}`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-[#d4d4d4]">
                        <span
                          className="h-[6px] w-[6px] shrink-0 rounded-full"
                          style={{
                            background: accentColor(terminal.status),
                            boxShadow: `0 0 8px ${accentColor(terminal.status)}66`,
                          }}
                        />
                        <span className="truncate">{providerLabel(terminal.preset)}</span>
                      </span>
                      <span
                        className="inline-flex h-5 w-fit items-center border px-2"
                        style={{
                          borderColor: `${accentColor(terminal.status)}33`,
                          background: `${accentColor(terminal.status)}12`,
                          color: accentColor(terminal.status),
                        }}
                      >
                        {statusLabel(terminal.status)}
                      </span>
                      <span
                        className="inline-flex h-5 min-w-0 items-center border px-2"
                        style={{
                          borderColor: 'rgba(255,255,255,0.055)',
                          background: 'rgba(255,255,255,0.014)',
                          color: '#8a8a8a',
                        }}
                      >
                        <span className="truncate">{modelLabel(terminal)}</span>
                      </span>
                      <span className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-2">
                        <span
                          className="h-1 overflow-hidden rounded-full"
                          style={{ background: 'rgba(255,255,255,0.06)' }}
                        >
                          <span
                            className="block h-full rounded-full transition-[width,background] duration-300"
                            style={{
                              width: `${Math.round((contextRatio(terminal) ?? 0) * 100)}%`,
                              background: contextRatioColor(contextRatio(terminal)),
                            }}
                          />
                        </span>
                        <span className="whitespace-nowrap" style={{ color: contextRatioColor(contextRatio(terminal)) }}>{contextLabel(terminal)}</span>
                      </span>
                      <span className="text-right text-[#555]" title={`input ${formatTokenCount(terminal.inputTokens)} · output ${formatTokenCount(terminal.outputTokens)}`}>
                        {formatAge(terminal.updatedAt)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>

    </div>
  )
}
