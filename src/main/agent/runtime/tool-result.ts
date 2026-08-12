import type { ToolResult } from '../../../shared/ipc/agent-runtime'

export function toolResultToModelValue(result: ToolResult): unknown {
  if (result.status === 'completed') return result.output
  if (result.reasonCode === 'APPROVAL_DENIED') {
    return {
      ok: false,
      status: result.status,
      reasonCode: result.reasonCode,
      userDenied: true,
      guidance: 'The user declined this action in the approval dialog. Do not retry it; acknowledge the decision and continue helping.',
    }
  }
  if (result.reasonCode === 'TARGET_CHANGED') {
    return {
      ok: false,
      status: result.status,
      reasonCode: result.reasonCode,
      retryable: true,
      error: result.error || `${result.toolName} ${result.status}`,
      guidance: 'The file changed during this read attempt. The workspace is not locked. Call workspace_read once more to obtain the current content and SHA-256 before editing.',
    }
  }
  return {
    ok: false,
    status: result.status,
    reasonCode: result.reasonCode,
    error: result.error || `${result.toolName} ${result.status}`,
  }
}
