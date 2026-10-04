import { useEffect, useState } from 'react'
import type { ExternalMcpClientId, ExternalMcpProbeResult, ExternalMcpStatus } from '../../../shared/ipc/knowledge'
import { useI18n } from '@/i18n/useI18n'
import styles from './KnowledgeSettingsPanel.module.css'

export function ExternalMcpPanel() {
  const { t } = useI18n('settings')
  const [status, setStatus] = useState<ExternalMcpStatus | null>(null)
  const [probe, setProbe] = useState<ExternalMcpProbeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const refresh = async () => setStatus(await window.electron.knowledge.externalMcpStatus())
  useEffect(() => {
    let cancelled = false
    window.electron.knowledge.externalMcpStatus().then(value => { if (!cancelled) setStatus(value) }).catch(() => { if (!cancelled) setMessage(t('settings:knowledge.mcp.unavailable')) })
    return () => { cancelled = true }
  }, [t])
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const register = (id: ExternalMcpClientId) => run(async () => {
    const result = await window.electron.knowledge.registerExternalMcp(id)
    if (!result.ok) throw new Error(result.error)
    setMessage(t('settings:knowledge.mcp.saved', { path: result.configPath }))
    await refresh()
  })
  return <section className={styles.section}>
    <h3 className={styles.sectionTitle}>{t('settings:knowledge.section.externalMcp')}</h3>
    <p className={styles.hint}>{t('settings:mcpAccess.description')}</p>
    <div className={styles.row}>
      <span className={styles.hint}>{status?.entryExists ? status.entry : t('settings:knowledge.mcp.notBuilt')}</span>
      <button className={styles.button} disabled={busy} onClick={() => void run(refresh)}>{t('settings:mcpAccess.refresh')}</button>
    </div>
    <div className={styles.row}>
      <button className={styles.button} disabled={busy || !status?.entryExists} onClick={() => void run(async () => {
        // Copy a complete launch specification, including the selected data root and packaged runtime environment.
        await navigator.clipboard.writeText(JSON.stringify(status!.launch ?? { command: 'node', args: [status!.entry] }, null, 2))
        setMessage(t('settings:knowledge.mcp.copied'))
      })}>{t('settings:mcpAccess.copy')}</button>
      <button className={styles.button} disabled={busy || !status?.entryExists} onClick={() => void run(async () => { setProbe(null); setProbe(await window.electron.knowledge.probeExternalMcp()) })}>{t('settings:mcpAccess.probe')}</button>
    </div>
    {status?.clients.map(client => <div className={styles.row} key={client.id}>
      <div className={styles.label}><span className={styles.labelText}>{client.label}</span>
        <span className={styles.hint}>{client.support === 'unverified' ? t('settings:mcpAccess.unverified') : client.support === 'manual' ? t('settings:mcpAccess.manual') : client.configPath}</span>
        {client.support === 'automatic' && <span className={styles.hint}>{t(client.current ? 'settings:mcpAccess.current' : client.registered ? 'settings:mcpAccess.stale' : 'settings:mcpAccess.absent')}</span>}
        {client.error && <span role="alert" className={styles.hint}>{client.error}</span>}
      </div>
      {(client.support === 'automatic' || !client.support) && <button className={styles.button} disabled={busy || !status.entryExists} onClick={() => void register(client.id)}>{t(client.registered ? 'settings:mcpAccess.repair' : 'settings:knowledge.mcp.register')}</button>}
    </div>)}
    {probe && <p role="status">{t(probe.ok ? 'settings:mcpAccess.passed' : 'settings:mcpAccess.failed', { stage: probe.stage })}{probe.error ? ` · ${probe.error}` : ''}</p>}
    {message && <p role="status">{message}</p>}
  </section>
}
