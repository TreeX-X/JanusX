import { useId } from 'react'
import { useAppStore } from '@/stores/app'
import { useAssistantStore } from '@/stores/assistant'
import { useExperimentalStore } from '@/stores/experimental'
import { useI18n } from '@/i18n/useI18n'
import { KnowledgeAssist } from './KnowledgeAssist'
import { UserPersonaTool } from './UserPersonaTool'
import { AutomationStatus } from './AutomationStatus'
import { MemoryReviewTool } from './MemoryReviewTool'
import styles from './AssistantTool.module.css'
import surface from './MemorySurface.module.css'

// Note: assistant sections share the session tab pattern — see .agents/notes/2026-10-06-knowledge-review-status-audit-plan--76ef32d1.md
export function AssistantTool({ active, workspaceId, workspacePath }: {
  active: boolean; workspaceId: string | null; workspacePath: string | null
}) {
  const { t } = useI18n('knowledge')
  const tabId = useId()
  const engineering = useExperimentalStore(s => s.knowledge)
  const personal = useExperimentalStore(s => s.persona)
  const { section: chosen, setSection, setWorkbenchDomain } = useAssistantStore()
  const section = chosen === 'engineering' && !engineering ? 'personal' : chosen === 'personal' && !personal ? 'engineering' : chosen
  const sections = (['engineering', 'personal', 'review'] as const).filter(item => item === 'review' || (item === 'engineering' ? engineering : personal))
  if (!engineering && !personal) return null
  return <section className={styles.root} aria-label={t('knowledge:assistant.title')}>
    <nav className={styles.tabs} role="tablist" aria-label={t('knowledge:assistant.sections')}>
      {sections.map((item, index) =>
        <button key={item} type="button" role="tab" id={`${tabId}-${item}`} aria-controls={`${tabId}-panel`}
          aria-selected={section === item} tabIndex={section === item ? 0 : -1} onClick={() => setSection(item)}
          onKeyDown={event => {
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1
              : event.key === 'ArrowRight' ? (index + 1) % sections.length
                : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : -1
            if (next < 0) return
            event.preventDefault()
            setSection(sections[next]!)
            document.getElementById(`${tabId}-${sections[next]}`)?.focus()
          }}>{t(`knowledge:assistant.${item}`)}</button>)}
    </nav>
    {engineering && <AutomationStatus active={active} />}
    <div key={section} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${section}`} className={`${styles.content} ${surface.enter}`}>
      {section === 'engineering' && <KnowledgeAssist workspaceId={workspaceId} workspacePath={workspacePath} />}
      {section === 'personal' && <UserPersonaTool active={active} onOpenReview={() => setSection('review')} />}
      {section === 'review' && <MemoryReviewTool active={active} showAutomation={false} />}
    </div>
    <button className={styles.open} type="button" onClick={() => {
      setWorkbenchDomain(section === 'personal' || !engineering ? 'personal' : 'engineering')
      useAppStore.getState().setActiveWorkbench('knowledge')
    }}>{t('knowledge:assistant.open')}</button>
  </section>
}
