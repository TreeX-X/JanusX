import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { runTranscript } from '@/services/harness'
import type { HarnessTranscript } from '../../../../shared/ipc/harness'

export function useImplementationHistory(cwd: string, runId: string | null, onSettled: () => Promise<void>) {
  const [snapshot, setSnapshot] = useState<{ cwd: string; runId: string; transcript?: HarnessTranscript; error?: string }>()
  useEffect(() => {
    if (!runId) return
    let cancelled = false
    let wasActive = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const transcript = await runTranscript(cwd, runId)
        if (cancelled) return
        setSnapshot({ cwd, runId, transcript })
        if (wasActive && !transcript.active) await onSettled()
        wasActive = transcript.active
      } catch (error) {
        if (cancelled) return
        setSnapshot((current) => ({ transcript: current?.cwd === cwd && current.runId === runId ? current.transcript : undefined, cwd, runId, error: error instanceof Error ? error.message : String(error) }))
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 1000)
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [cwd, runId, onSettled])
  return snapshot?.cwd === cwd && snapshot.runId === runId ? snapshot : undefined
}

export function HarnessImplementationHistory({ transcript, error }: { transcript?: HarnessTranscript; error?: string }) {
  const { t } = useI18n('janus')
  return <section className="harness-run-panel__result" aria-label={t('janus:harness.history.title')}>
    <span className="harness-run-panel__title">{t('janus:harness.history.title')}</span>
    {error ? <p role="alert">{t('janus:harness.history.loadFailed', { message: error })}</p> : null}
    {transcript?.active ? <p role="status">{t('janus:harness.history.active')}</p> : null}
    {transcript && !transcript.turns.length ? <p>{t('janus:harness.history.empty')}</p> : null}
    {transcript?.turns.map((turn) => <details key={turn.id} open>
      <summary>{t('janus:harness.history.turn', { attempt: turn.attempt, status: t(`janus:harness.history.${turn.status}`) })} · {turn.modelId}</summary>
      {turn.text ? <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 280, overflow: 'auto' }}>{turn.text}</pre> : null}
      {turn.tools.length ? <ul>{turn.tools.map((tool) => <li key={tool.id}>{tool.name} [{tool.status}]{tool.summary ? ` ${tool.summary}` : ''}</li>)}</ul> : null}
      {turn.error ? <p>{turn.error}</p> : null}
      {turn.truncated ? <p>{t('janus:harness.history.truncated')}</p> : null}
    </details>)}
  </section>
}
