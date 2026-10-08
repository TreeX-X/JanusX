import type { Blueprint } from '@/services/blueprint'
import { useI18n } from '@/i18n/useI18n'
import './note-wiki.css'

const labels: Record<string, string> = { bound: '已接入', connected: '已连接', dangling: '悬空需求', idle: '暂无消费者', unbound: '未接入', stale: '来源已变化' }
export function BlueprintCompositionPanel({ blueprint, nodeId, onSelect }: { blueprint: Blueprint; nodeId?: string; onSelect: (id: string) => void }) {
  const { t } = useI18n('blueprint')
  const value = blueprint.composition
  if (!value) return null
  const ports = value.interfaces.filter(port => !nodeId || port.nodeId === nodeId)
  const diagnostics = nodeId ? value.diagnostics.filter(item => item.nodeId === nodeId) : []
  if (!ports.length && !diagnostics.length) return null
  return <details className="bp-composition" open={nodeId ? true : undefined}>
    <summary>{t(nodeId ? 'blueprint:sourceInfo.moduleInterfaces' : 'blueprint:sourceInfo.interfaces', { count: ports.length })}</summary>
    <section aria-label={t('blueprint:sourceInfo.interfaceDetails')}>
      {ports.map(port => <div className="bp-note-relation" key={port.id}><button type="button" onClick={() => onSelect(port.nodeId)}>{blueprint.nodes[port.nodeId]?.title} · {port.name}</button><small>{port.direction === 'provides' ? '提供' : '需要'} · {labels[port.status]}</small>{port.provider && <button type="button" disabled={!port.providerNodeId} title={port.provider} onClick={() => port.providerNodeId && onSelect(port.providerNodeId)}>提供方：{blueprint.nodes[port.providerNodeId ?? '']?.title ?? port.provider}</button>}</div>)}
      {diagnostics.map((item, index) => <div className="bp-note-warning" key={index}>
        {item.nodeId && blueprint.nodes[item.nodeId] && <button type="button" onClick={() => onSelect(item.nodeId!)}>{blueprint.nodes[item.nodeId].title}</button>}
        <p>{item.message}</p>{item.sourceUri && <small>{item.sourceUri}</small>}
      </div>)}
    </section>
  </details>
}
