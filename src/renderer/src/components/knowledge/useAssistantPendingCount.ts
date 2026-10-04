import { useEffect, useState } from 'react'
import { useExperimentalStore } from '@/stores/experimental'
import { loadReviewCandidates } from './MemoryReviewTool'
import { isUserScopeCandidate, splitReviewCandidates } from './inboxScope'

export function useAssistantPendingCount(): number | null {
  const engineering = useExperimentalStore(s => s.knowledge)
  const personal = useExperimentalStore(s => s.persona)
  const [result, setResult] = useState<{ engineering: boolean; personal: boolean; count: number | null }>()
  useEffect(() => {
    if (!engineering && !personal) return
    let cancelled = false
    let running = false
    const refresh = async () => {
      if (running || document.visibilityState === 'hidden') return
      running = true
      try {
        const [items, automation] = await Promise.all([loadReviewCandidates(engineering), engineering ? window.electron.knowledge.automationStatus() : null])
        const visible = items.filter(item => isUserScopeCandidate(item) ? personal : engineering)
        if (!cancelled) setResult({ engineering, personal, count: splitReviewCandidates(visible, automation).manual.length })
      } catch { if (!cancelled) setResult({ engineering, personal, count: null }) }
      finally { running = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    window.addEventListener('focus', refresh)
    window.addEventListener('janusx-memory-changed', refresh)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('janusx-memory-changed', refresh) }
  }, [engineering, personal])
  return result?.engineering === engineering && result.personal === personal ? result.count : null
}
