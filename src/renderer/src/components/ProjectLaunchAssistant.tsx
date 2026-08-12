import { useEffect, useRef, useState } from 'react'
import { ArrowUp, LoaderCircle, Square } from 'lucide-react'
import type { LaunchConfig } from '@/types/project'
import type { RunningProjectSummary } from '../../../shared/ipc/project'
import {
  streamWorkspaceLaunchAssistant,
  type LaunchAssistantResponse,
  type WorkspaceLaunchAnalysis,
} from '@/services/workspace-launch-assistant'
import { useStreamingPrinter } from '@/hooks/useStreamingPrinter'
import { MarkdownContent, StreamingText } from './chat/ChatContent'
import { useI18n } from '@/i18n/useI18n'
import styles from './ProjectSettings.module.css'

type Message = { role: 'user' | 'assistant'; content: string }

interface ProjectLaunchAssistantProps {
  analysis: WorkspaceLaunchAnalysis | null
  config: LaunchConfig | null
  busy: boolean
  runningProjects: RunningProjectSummary[]
  onAnalyze: () => Promise<WorkspaceLaunchAnalysis | null>
  onConfig: (config: LaunchConfig) => void
  onSave: (config?: LaunchConfig) => Promise<boolean>
  onTest: (script?: string) => Promise<void>
  onRun: (config?: LaunchConfig) => Promise<void>
  onStop: () => Promise<void>
}

export function ProjectLaunchAssistant({
  analysis, config, busy, runningProjects, onAnalyze, onConfig, onSave, onTest, onRun, onStop,
}: ProjectLaunchAssistantProps) {
  const { t } = useI18n('editor')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: t('editor:launcher.greeting'),
  }])
  const abortRef = useRef<(() => void) | null>(null)
  const streamIdRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const { output: pendingContent, append, complete, flush, reset } = useStreamingPrinter()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, pendingContent])

  useEffect(() => () => {
    streamIdRef.current += 1
    abortRef.current?.()
  }, [])

  const applyResponse = async (response: LaunchAssistantResponse) => {
    if (response.config) onConfig(response.config)
    if (response.action === 'save') await onSave(response.config ?? undefined)
    if (response.action === 'test') await onTest(response.testScript)
    if (response.action === 'run') {
      if (response.config && !await onSave(response.config)) return
      await onRun(response.config ?? undefined)
    }
    if (response.action === 'stop') await onStop()
  }

  const stop = () => {
    streamIdRef.current += 1
    abortRef.current?.()
    abortRef.current = null
    const partial = flush().trim()
    reset()
    if (partial) setMessages((current) => [...current, { role: 'assistant', content: partial }])
    setStreaming(false)
    setSending(false)
  }

  const send = async () => {
    const request = input.trim()
    if (!request || sending || busy || !config) return
    setInput('')
    setMessages((current) => [...current, { role: 'user', content: request }])
    setSending(true)
    const streamId = streamIdRef.current + 1
    streamIdRef.current = streamId
    try {
      const workspaceAnalysis = analysis ?? await onAnalyze()
      if (streamIdRef.current !== streamId) return
      if (!workspaceAnalysis) throw new Error(t('editor:project.analysisIncomplete'))
      reset()
      setStreaming(true)
      const { abort } = streamWorkspaceLaunchAssistant({
        request,
        analysis: workspaceAnalysis,
        config,
        runningProjects,
        history: messages,
        onDelta: (delta) => {
          if (streamIdRef.current === streamId) append(delta)
        },
        onDone: (response) => {
          if (streamIdRef.current !== streamId) return
          abortRef.current = null
          void complete().then(async () => {
            if (streamIdRef.current !== streamId) return
            setMessages((current) => [...current, { role: 'assistant', content: response.message }])
            reset()
            setStreaming(false)
            try {
              await applyResponse(response)
            } catch (error) {
              if (streamIdRef.current !== streamId) return
              setMessages((current) => [...current, {
                role: 'assistant',
                content: error instanceof Error ? error.message : t('editor:launcher.actionFailed'),
              }])
            } finally {
              if (streamIdRef.current === streamId) setSending(false)
            }
          })
        },
        onError: (error) => {
          if (streamIdRef.current !== streamId) return
          abortRef.current = null
          const partial = flush().trim()
          reset()
          setMessages((current) => [
            ...current,
            ...(partial ? [{ role: 'assistant' as const, content: partial }] : []),
            { role: 'assistant', content: error },
          ])
          setStreaming(false)
          setSending(false)
        },
      })
      abortRef.current = abort
    } catch (error) {
      if (streamIdRef.current !== streamId) return
      setMessages((current) => [...current, {
        role: 'assistant',
        content: error instanceof Error ? error.message : t('editor:launcher.requestFailed'),
      }])
      setSending(false)
    }
  }

  return (
    <aside className={styles.assistant} aria-label="Janus workspace launch assistant">
      <div className={styles.assistantHeader}>
        <div>
          <strong>Janus</strong>
          <span>{analysis ? t('editor:launcher.workspaceRead') : t('editor:launcher.waitingAnalysis')}</span>
        </div>
      </div>
      <div className={styles.messages}>
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}>
            {message.role === 'assistant' ? <MarkdownContent content={message.content} /> : message.content}
          </div>
        ))}
        {(streaming || pendingContent) && (
          <div className={`${styles.assistantMessage} ${styles.streamingMessage}`}>
            {pendingContent
              ? <StreamingText content={pendingContent} />
              : <LoaderCircle size={14} className={styles.spinIcon} />}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className={styles.promptBox}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          placeholder={t('editor:launcher.inputPlaceholder')}
          rows={3}
          disabled={sending || busy}
        />
        <button
          className={styles.sendButton}
          onClick={() => streaming ? stop() : void send()}
          disabled={!streaming && (!input.trim() || sending || busy)}
          title={streaming ? t('editor:launcher.stopGeneration') : t('editor:launcher.send')}
        >
          {streaming
            ? <Square size={11} fill="currentColor" />
            : sending
              ? <LoaderCircle size={14} className={styles.spinIcon} />
              : <ArrowUp size={14} />}
        </button>
      </div>
    </aside>
  )
}

export default ProjectLaunchAssistant
