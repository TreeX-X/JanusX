import type { Blueprint } from '@/services/blueprint'
import './note-wiki.css'

const labels: Record<string, string> = { bound: '已接入', connected: '已连接', dangling: '悬空需求', idle: '暂无消费者', unbound: '未接入', stale: '来源已变化' }
export function BlueprintCompositionPanel({ blueprint, nodeId, onSelect }: { blueprint: Blueprint; nodeId?: string; onSelect: (id: string) => void }) {
  const value = blueprint.composition
  if (!value) return null
  const ports = value.interfaces.filter(port => !nodeId || port.nodeId === nodeId)
  const diagnostics = value.diagnostics.filter(item => !nodeId || !item.nodeId || item.nodeId === nodeId)
  if (!ports.length && !diagnostics.length && !value.checkouts.length) return null
  return <details className="bp-composition" open={nodeId ? true : undefined}>
    <summary>组合蓝图 · {value.checkouts.length} 个 checkout · {ports.length} 个接口 · {diagnostics.length} 项提示</summary>
    <section aria-label="组合蓝图状态">
      {!nodeId && value.checkouts.map(row => <div className="bp-note-diagnostic" key={row.repoId + ':' + row.checkoutId}><strong>{row.name ?? row.checkoutId} · {labels[row.status]}</strong><small>{row.path} · 修订 {row.revision ?? '未知'}{row.selected ? ' · 已选定' : ''}{row.dirty ? ' · 有未提交修改' : ''}</small>{row.diagnostic && <small>{row.diagnostic}</small>}</div>)}
      {ports.map(port => <div className="bp-note-relation" key={port.id}><button type="button" onClick={() => onSelect(port.nodeId)}>{blueprint.nodes[port.nodeId]?.title} · {port.name}</button><small>{port.direction === 'provides' ? '提供' : '需要'} · {labels[port.status]}</small>{port.provider && <button type="button" disabled={!port.providerNodeId} title={port.provider} onClick={() => port.providerNodeId && onSelect(port.providerNodeId)}>提供方：{blueprint.nodes[port.providerNodeId ?? '']?.title ?? port.provider}</button>}</div>)}
      {diagnostics.map((item, index) => <p className="bp-note-warning" key={index}>{item.message}</p>)}
    </section>
  </details>
}
