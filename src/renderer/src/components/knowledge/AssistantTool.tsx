import { useAppStore } from '@/stores/app'
import { useAssistantStore } from '@/stores/assistant'
import { useExperimentalStore } from '@/stores/experimental'
import { useI18n } from '@/i18n/useI18n'
import { KnowledgeAssist } from './KnowledgeAssist'
import { UserPersonaTool } from './UserPersonaTool'
import { MemoryReviewTool } from './MemoryReviewTool'
import styles from './AssistantTool.module.css'
import surface from './MemorySurface.module.css'

export function AssistantTool({ active, workspaceId, workspacePath }: {
  active: boolean; workspaceId: string | null; workspacePath: string | null
}) {
  const { t } = useI18n('knowledge')
  const engineering = useExperimentalStore(s => s.knowledge)
  const personal = useExperimentalStore(s => s.persona)
  const { section: chosen, setSection, setWorkbenchDomain } = useAssistantStore()
  const section = chosen === 'engineering' && !engineering ? 'personal' : chosen === 'personal' && !personal ? 'engineering' : chosen
  if (!engineering && !personal) return null
  return <section className={styles.root} aria-label={t('knowledge:assistant.title')}>
    <nav className={styles.tabs} aria-label={t('knowledge:assistant.sections')}>
      {(['engineering', 'personal', 'review'] as const).filter(item => item === 'review' || (item === 'engineering' ? engineering : personal)).map(item =>
        <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)}>{t(`knowledge:assistant.${item}`)}</button>)}
    </nav>
    <div key={section} className={`${styles.content} ${surface.enter}`}>
      {section === 'engineering' && <KnowledgeAssist workspaceId={workspaceId} workspacePath={workspacePath} />}
      {section === 'personal' && <UserPersonaTool active={active} onOpenReview={() => setSection('review')} />}
      {section === 'review' && <MemoryReviewTool active={active} />}
    </div>
    <button className={styles.open} type="button" onClick={() => {
      setWorkbenchDomain(section === 'personal' || !engineering ? 'personal' : 'engineering')
      useAppStore.getState().setActiveWorkbench('knowledge')
    }}>{t('knowledge:assistant.open')}</button>
  </section>
}
