import { useEffect, useSyncExternalStore } from 'react'
import type { KnowledgeAutomationStatus } from '../../../shared/knowledge-automation'

// Note: both review entrances share one live status source — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
interface State { status: KnowledgeAutomationStatus | null; error: boolean }
let state: State = { status: null, error: false }
const listeners = new Set<() => void>()
let users = 0
let epoch = 0
let timer: ReturnType<typeof setTimeout> | undefined
let flight: Promise<void> | undefined
const emit = () => { for (const listener of listeners) listener() }
function schedule() {
  clearTimeout(timer)
  if (users && !document.hidden) timer = setTimeout(() => void refreshKnowledgeAutomation(), state.status?.running ? 2000 : 10000)
}
export function refreshKnowledgeAutomation(): Promise<void> {
  if (flight) return flight
  const request = epoch
  const operation = (async () => {
    try {
      const status = await window.electron.knowledge.automationStatus()
      if (request === epoch) { state = { status, error: false }; emit() }
    } catch {
      if (request === epoch) { state = { status: null, error: true }; emit() }
    }
  })()
  flight = operation.finally(() => { if (flight === pending) { flight = undefined; schedule() } })
  const pending = flight
  return flight
}
function invalidate() {
  epoch++
  clearTimeout(timer)
  state = { status: null, error: false }
  emit()
}
function refreshWhenActive() {
  // Wait for an in-flight read before starting another; ignore its old result.
  if (users && !document.hidden) void (flight ?? Promise.resolve()).then(() => {
    if (users && !document.hidden) return refreshKnowledgeAutomation()
  })
}
function onChanged() {
  invalidate()
  refreshWhenActive()
}
function activate() {
  if (++users === 1) {
    invalidate()
    document.addEventListener('visibilitychange', onChanged)
    window.addEventListener('janusx-memory-changed', onChanged)
    refreshWhenActive()
  }
  return () => {
    if (--users === 0) {
      invalidate()
      document.removeEventListener('visibilitychange', onChanged)
      window.removeEventListener('janusx-memory-changed', onChanged)
    }
  }
}
export function useKnowledgeAutomation(active: boolean): State {
  const value = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => state)
  useEffect(() => active ? activate() : undefined, [active])
  return active ? value : { status: null, error: false }
}
