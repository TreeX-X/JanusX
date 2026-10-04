import { useState } from 'react'
import type { ComponentProps } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { UserPersonaCards } from './UserPersonaCards'
import styles from './PersonalMemoryBoard.module.css'

type Category = 'all' | 'profile' | 'confirmed' | 'uncertain' | 'recent'

/** Full workbench layout; all mutations reuse the sidebar's reviewed operations. */
export function PersonalMemoryBoard(props: ComponentProps<typeof UserPersonaCards>) {
  const { overview, onEditProfile, onCorrect, onForget, onForgetEpisode, onRefresh, onOpenInbox } = props
  const { t } = useI18n('knowledge')
  const [category, setCategory] = useState<Category>('all')
  const [query, setQuery] = useState('')
  const [selectedId, select] = useState('')
  const cards = [
    ...[overview.profile.identity, ...(overview.profile.formatPrefs ?? []), ...(overview.profile.toolPrefs ?? [])]
      .filter((content): content is string => Boolean(content)).map((content, index) => ({ id: `profile:${index}`, content, category: 'profile' as Category, date: '', sources: '', habit: undefined, episode: undefined })),
    ...overview.habits.map(habit => ({ id: `fact:${habit.id}`, content: habit.content, category: (habit.confirmed ? 'confirmed' : 'uncertain') as Category,
      date: habit.lastSeenAt ?? '', sources: [habit.id, ...habit.observationIds].join('\n'), habit, episode: undefined })),
    ...overview.recent.map(episode => ({ id: `episode:${episode.id}`, content: episode.content, category: 'recent' as Category,
      date: episode.expiresAt, sources: episode.id, habit: undefined, episode })),
  ]
  const visible = cards.filter(card => (category === 'all' || card.category === category) && card.content.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const selected = visible.find(card => card.id === selectedId)
  const label = (value: Category) => t(`knowledge:personalBoard.${value}`)
  return <div className={styles.root}>
    <header className={styles.header}>
      <div><h2>{t('knowledge:domains.personal')}</h2><p>{t('knowledge:personalBoard.description')}</p></div>
      <div className={styles.actions}>
        <button type="button" onClick={onEditProfile}>{t('knowledge:persona.overrides.edit')}</button>
        {onOpenInbox && <button type="button" onClick={onOpenInbox}>{t('knowledge:assistant.review')} · {overview.pendingHabitCount}</button>}
        <button type="button" onClick={onRefresh}>{t('knowledge:personalBoard.refresh')}</button>
      </div>
    </header>
    <div className={styles.layout} data-detail={Boolean(selected)}>
      <nav className={styles.categories} aria-label={t('knowledge:personalBoard.categories')}>
        {(['all', 'profile', 'confirmed', 'uncertain', 'recent'] as const).map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => { setCategory(value); select('') }}>
          <span>{label(value)}</span><span>{cards.filter(card => value === 'all' || card.category === value).length}</span>
        </button>)}
      </nav>
      <main className={styles.main}>
        <input className={styles.search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('knowledge:personalBoard.search')} aria-label={t('knowledge:personalBoard.search')} />
        <div className={styles.grid}>
          {visible.map(card => <button type="button" key={card.id} className={styles.card} aria-pressed={selected?.id === card.id} onClick={() => select(card.id)}>
            <span className={styles.kind}>{label(card.category)}</span>
            <p>{card.content}</p>
            <span className={styles.meta}>{card.date ? (card.category === 'recent' ? t('knowledge:persona.expires', { date: card.date.slice(0, 10) }) : t('knowledge:personalBoard.updated', { date: card.date.slice(0, 10) })) : t('knowledge:personalBoard.details')}</span>
          </button>)}
          {!visible.length && <p className={styles.empty}>{t('knowledge:personalBoard.empty')}</p>}
        </div>
      </main>
      {selected && <aside className={styles.detail} aria-label={t('knowledge:personalBoard.details')}>
        <header><h3>{label(selected.category)}</h3><button type="button" onClick={() => select('')}>{t('knowledge:personalBoard.close')}</button></header>
        <p className={styles.fullText}>{selected.content}</p>
        {selected.date && <p className={styles.meta}>{selected.category === 'recent' ? t('knowledge:persona.expires', { date: selected.date.slice(0, 10) }) : t('knowledge:personalBoard.updated', { date: selected.date.slice(0, 10) })}</p>}
        {selected.sources && <details><summary>{t('knowledge:detail.source')}</summary><pre>{selected.sources}</pre></details>}
        <div className={styles.actions}>
          {selected.category === 'profile' && <button type="button" onClick={onEditProfile}>{t('knowledge:persona.overrides.edit')}</button>}
          {selected.habit && <>
            <button type="button" disabled={!selected.habit.contentHash} onClick={() => onCorrect?.(selected.habit!)}>{t('knowledge:persona.correctMemory')}</button>
            <button type="button" disabled={!selected.habit.contentHash} onClick={() => onForget?.(selected.habit!)}>{t('knowledge:persona.forgetMemory')}</button>
          </>}
          {selected.episode && <button type="button" disabled={!selected.episode.contentHash} onClick={() => onForgetEpisode?.(selected.episode!)}>{t('knowledge:persona.forgetMemory')}</button>}
        </div>
      </aside>}
    </div>
  </div>
}
