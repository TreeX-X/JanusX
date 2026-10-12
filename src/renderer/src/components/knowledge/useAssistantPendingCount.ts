import { useEffect, useState } from 'react'
import { useExperimentalStore } from '@/stores/experimental'
import { loadReviewCandidates } from './MemoryReviewTool'

export function useAssistantPendingCount(): number | null {
  const personal = useExperimentalStore(s => s.persona)
  const [result, setResult] = useState<{ personal: boolean; count: number | null }>()
  useEffect(() => {
    if (!personal) return
    let cancelled = false
    let running = false
    const refresh = async () => {
      if (running || document.visibilityState === 'hidden') return
      running = true
      try {
        const items = await loadReviewCandidates()
        const count = items.length
        if (!cancelled) setResult({ personal, count })
      } catch { if (!cancelled) setResult({ personal, count: null }) }
      finally { running = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    window.addEventListener('focus', refresh)
    window.addEventListener('janusx-memory-changed', refresh)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('janusx-memory-changed', refresh) }
  }, [personal])
  return result?.personal === personal ? result.count : null
}
