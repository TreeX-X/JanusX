// Note: host call identity survives async policy approval without entering model payloads — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { WorkspaceAgentRuntime } from '@janus-agent/agent-core'

const events = new AsyncLocalStorage<{ sessionId: string; sourceEventId: string }>()
export const currentMemoryToolEvent = () => events.getStore()

export function bindMemoryToolIdentity<T extends WorkspaceAgentRuntime>(runtime: T): T {
  const execute = runtime.executeTool.bind(runtime)
  runtime.executeTool = (input, callerId) => {
    const correlationId = input.call.correlationId ?? randomUUID()
    return events.run({ sessionId: input.sessionId, sourceEventId: correlationId },
      () => execute({ ...input, call: { ...input.call, correlationId } }, callerId))
  }
  return runtime
}
