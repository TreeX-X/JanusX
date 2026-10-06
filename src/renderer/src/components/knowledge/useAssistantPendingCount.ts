import { useEffect, useState } from 'react'
import { useExperimentalStore } from '@/stores/experimental'
import { loadReviewCandidates } from './MemoryReviewTool'
import { isUserScopeCandidate } from './inboxScope'
import { candidateReviewState } from './candidateReviewState'
import { reviewCandidateInput } from '../../../../shared/review-candidate-snapshot'
import { useKnowledgeAutomation } from '../../services/knowledge-automation'

export function useAssistantPendingCount(): number | null {
  const engineering = useExperimentalStore(s => s.knowledge)
  const personal = useExperimentalStore(s => s.persona)
  const { status: automation } = useKnowledgeAutomation(engineering)
  const [result, setResult] = useState<{ engineering: boolean; personal: boolean; count: number | null }>()
  useEffect(() => {
    if (!engineering && !personal) return
    let cancelled = false
    let running = false
    const refresh = async () => {
      if (running || document.visibilityState === 'hidden') return
      running = true
      try {
        const items = await loadReviewCandidates(engineering)
        const visible = items.filter(item => isUserScopeCandidate(item) ? personal : engineering)
        const states = await Promise.all(visible.map(async item => candidateReviewState(item, automation, (await reviewCandidateInput(item)).candidateHash)))
        const count = states.some(state => state.status === 'unknown') ? null : states.filter(state => state.canReview).length
        if (!cancelled) setResult({ engineering, personal, count })
      } catch { if (!cancelled) setResult({ engineering, personal, count: null }) }
      finally { running = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    window.addEventListener('focus', refresh)
    window.addEventListener('janusx-memory-changed', refresh)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('janusx-memory-changed', refresh) }
  }, [engineering, personal, automation])
  return result?.engineering === engineering && result.personal === personal ? result.count : null
}
