import { createHash, randomUUID } from 'node:crypto'
import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron'
import type { ActionRisk, ApprovalPreview } from '../../../shared/ipc/agent-runtime'
import { createPolicyDecisionRecord, evaluateWorkspaceActionPolicy, settleApprovalDecision } from './policy-gate'
import { FilePolicyAuditStore } from './policy-audit-store'

const auditStore = new FilePolicyAuditStore()

export interface RendererActionRequest {
  workspaceRoot: string
  toolName: string
  actionRisk: ActionRisk
  preview: ApprovalPreview
  /**
   * 'renderer-user' 标记来自渲染进程的显式用户操作（文件树右键菜单、编辑器 Ctrl+S 等）。
   * 这类操作已由前端 UI 完成首次用户确认，主进程无需再次弹出原生审批对话框；
   * 仅记录审计日志，敏感路径拒绝与只读放行规则保持不变。
   */
  source?: 'renderer-user'
}

export type RendererActionAuthorizer = (event: IpcMainInvokeEvent, request: RendererActionRequest) => Promise<boolean>

export const authorizeRendererAction: RendererActionAuthorizer = async (event, request) => {
  const workspaceId = `legacy:${createHash('sha256').update(request.workspaceRoot).digest('hex').slice(0, 16)}`
  const sessionId = `renderer:${event.sender.id}`
  const correlationId = randomUUID()
  const initial = evaluateWorkspaceActionPolicy({ actionRisk: request.actionRisk })
  const base = { workspaceId, sessionId, correlationId, toolName: request.toolName, toolInput: { preview: request.preview } }

  // 显式用户操作：敏感路径仍由 evaluateWorkspaceActionPolicy 拒绝（outcome==='deny'），
  // 只读放行照旧；其余 approval-required 直接放行，不再弹原生对话框，避免与前端确认重复。
  if (request.source === 'renderer-user' && initial.outcome === 'approval-required') {
    const approved = settleApprovalDecision(initial, 'approved')
    await auditStore.record({ ...createPolicyDecisionRecord({ ...base, decision: approved }), provenance: 'manual-user' })
    return true
  }

  await auditStore.record({ ...createPolicyDecisionRecord({ ...base, decision: initial }), provenance: 'manual-user' })
  if (initial.outcome !== 'approval-required') return initial.outcome === 'allow'

  const owner = BrowserWindow.fromWebContents(event.sender)
  const options = {
    type: 'warning' as const,
    title: 'Approve workspace action',
    message: request.preview.summary,
    detail: [...request.preview.paths, request.preview.detail].filter(Boolean).join('\n').slice(0, 4_000),
    buttons: ['Cancel', 'Approve'],
    cancelId: 0,
    defaultId: 0,
    noLink: true,
  }
  const result = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options)
  const outcome = result.response === 1 ? 'approved' : 'denied'
  await auditStore.record({ ...createPolicyDecisionRecord({ ...base, decision: settleApprovalDecision(initial, outcome) }), provenance: 'manual-user' })
  return outcome === 'approved'
}
