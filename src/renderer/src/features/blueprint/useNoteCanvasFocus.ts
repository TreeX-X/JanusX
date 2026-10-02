import { useEffect, useMemo, useRef, type RefObject } from 'react'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { BlueprintNodeData } from '@/components/blueprint/BlueprintNodeCard'
import type { Blueprint } from '@/services/blueprint'
import { useNoteFocusStore } from '@/stores/note-focus'
import { useWorkspaceStore } from '@/stores/workspace'
import { sameCheckoutPath } from './resolveNodeWorkspace'
import { resolveFocusNodes } from './note-focus'

export function useNoteCanvasFocus(blueprint: Blueprint | null, ownerPath: string | null, nodes: Node<BlueprintNodeData, 'blueprint'>[], edges: Edge[], instance: RefObject<ReactFlowInstance<Node<BlueprintNodeData, 'blueprint'>, Edge> | null>, reveal: (ids: string[]) => void) {
  const display = useNoteFocusStore(state => state.display)
  const activePath = useWorkspaceStore(state => state.workspaces.find(workspace => workspace.id === state.activeWorkspaceId)?.path)
  const event = display && activePath && sameCheckoutPath(display.workspacePath, activePath) ? display : null
  const resolved = useMemo(() => resolveFocusNodes(blueprint, ownerPath, event), [blueprint, ownerPath, event])
  const handled = useRef<string | null>(null)
  const revealing = useRef<string | null>(null)
  const interaction = useRef({ busy: false, last: 0 })
  useEffect(() => {
    const release = () => { if (interaction.current.busy) { interaction.current.busy = false; interaction.current.last = Date.now() } }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release) }
  }, [])
  useEffect(() => {
    if (!event || event.id === handled.current || !instance.current || !nodes.length) return
    const editing = document.activeElement?.closest('.blueprint-workbench-detail-slot input, .blueprint-workbench-detail-slot textarea, .bp-node-detail input, .bp-node-detail textarea, [contenteditable="true"]')
    if (event.focus === 'none' || interaction.current.busy || editing || (event.focus === 'auto' && Date.now() - interaction.current.last < 1500)) { handled.current = event.id; return }
    const visible = nodes.filter(node => resolved.roles.has(node.id) && !node.hidden)
    if (visible.length < resolved.roles.size) {
      if (revealing.current !== event.id) { revealing.current = event.id; reveal([...resolved.roles.keys()]) }
      return
    }
    handled.current = event.id
    if (!visible.length) return
    // Do not enqueue a later jump after a user's drag or edit.
    void instance.current.fitView({ nodes: visible.map(node => ({ id: node.id })), padding: .3, maxZoom: 1.15, duration: 180 })
  }, [event, nodes, resolved, instance, reveal])
  return {
    nodes: useMemo<Node<BlueprintNodeData, 'blueprint'>[]>(() => nodes.map(node => ({ ...node, className: [node.className, resolved.roles.has(node.id) ? `bp-assistant-${resolved.roles.get(node.id)}` : ''].filter(Boolean).join(' ') })), [nodes, resolved]),
    edges: useMemo(() => edges.map(edge => resolved.roles.has(edge.source) && resolved.roles.has(edge.target) ? { ...edge, className: [edge.className, 'bp-assistant-edge'].filter(Boolean).join(' ') } : edge), [edges, resolved]),
    onPointerDown: () => { interaction.current = { busy: true, last: Date.now() } },
    onWheel: () => { interaction.current.last = Date.now() },
  }
}
