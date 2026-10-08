// Note: module-aware explicit navigation — see .agents/notes/blueprint/navigation/requirements/module-focus-navigation.md
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { BlueprintNodeData } from '@/components/blueprint/BlueprintNodeCard'
import type { Blueprint } from '@/services/blueprint'
import { useNoteFocusStore } from '@/stores/note-focus'
import { useWorkspaceStore } from '@/stores/workspace'
import { sameCheckoutPath } from './resolveNodeWorkspace'
import { resolveFocusNodes } from './note-focus'
import type { NoteFocusAction } from '../../../../shared/note-chat'

export interface NoteCanvasLocation { viewKey: string; nodeIds: string[] }

export function useNoteCanvasFocus(blueprint: Blueprint | null, ownerPath: string | null, nodes: Node<BlueprintNodeData, 'blueprint'>[], edges: Edge[], instance: RefObject<ReactFlowInstance<Node<BlueprintNodeData, 'blueprint'>, Edge> | null>, viewKey: string, reveal: (id: string, action: NoteFocusAction) => NoteCanvasLocation | null) {
  const display = useNoteFocusStore(state => state.display)
  const activePath = useWorkspaceStore(state => state.workspaces.find(workspace => workspace.id === state.activeWorkspaceId)?.path)
  const event = display && activePath && sameCheckoutPath(display.workspacePath, activePath) ? display : null
  const resolved = useMemo(() => resolveFocusNodes(blueprint, ownerPath, event), [blueprint, ownerPath, event])
  const handled = useRef<string | null>(null)
  const [pending, setPending] = useState<{ eventId: string; location: NoteCanvasLocation } | null>(null)
  const interaction = useRef({ busy: false })
  useEffect(() => {
    const release = () => { interaction.current.busy = false }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release) }
  }, [])
  useEffect(() => {
    if (!event || event.id === handled.current || !instance.current) return
    const editing = document.activeElement?.closest('.blueprint-workbench-detail-slot input, .blueprint-workbench-detail-slot textarea, .bp-node-detail input, .bp-node-detail textarea, [contenteditable="true"]')
    if (event.mode !== 'display' || event.focus !== 'explicit' || interaction.current.busy || editing) { handled.current = event.id; return }
    const primaryNote = event.notes.find(note => note.role === 'target') ?? event.notes[0]
    const primary = [...resolved.roles.keys()].find(id => blueprint?.nodes[id]?.sourceUri === primaryNote?.uri)
    if (!primary) { handled.current = event.id; return }
    if (pending?.eventId !== event.id) {
      const location = reveal(primary, event.action ?? 'locate')
      if (location) setPending({ eventId: event.id, location })
      else handled.current = event.id
      return
    }
    if (pending.location.viewKey !== viewKey) return
    const visible = nodes.filter(node => pending.location.nodeIds.includes(node.id) && !node.hidden)
    if (visible.length !== pending.location.nodeIds.length || visible.some(node => !node.measured?.width)) return
    handled.current = event.id
    if (!visible.length) return
    // Do not enqueue a later jump after a user's drag or edit.
    void instance.current.fitView({ nodes: visible.map(node => ({ id: node.id })), padding: .3, maxZoom: 1, duration: 0 })
  }, [event, nodes, resolved, instance, reveal, pending, viewKey, blueprint])
  return {
    nodes: useMemo<Node<BlueprintNodeData, 'blueprint'>[]>(() => nodes.map(node => ({ ...node, className: [node.className, resolved.roles.has(node.id) ? `bp-assistant-${resolved.roles.get(node.id)}` : ''].filter(Boolean).join(' ') })), [nodes, resolved]),
    edges: useMemo(() => edges.map(edge => resolved.roles.has(edge.source) && resolved.roles.has(edge.target) ? { ...edge, className: [edge.className, 'bp-assistant-edge'].filter(Boolean).join(' ') } : edge), [edges, resolved]),
    onPointerDown: () => { interaction.current.busy = true; handled.current = event?.id ?? null },
    onWheel: () => { handled.current = event?.id ?? null },
  }
}
