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
}

export type RendererActionAuthorizer = (event: IpcMainInvokeEvent, request: RendererActionRequest) => Promise<boolean>

export const authorizeRendererAction: RendererActionAuthorizer = async (event, request) => {
  const workspaceId = `legacy:${createHash('sha256').update(request.workspaceRoot).digest('hex').slice(0, 16)}`
  const sessionId = `renderer:${event.sender.id}`
  const correlationId = randomUUID()
  const initial = evaluateWorkspaceActionPolicy({ actionRisk: request.actionRisk })
  const base = { workspaceId, sessionId, correlationId, toolName: request.toolName, toolInput: { preview: request.preview } }
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
