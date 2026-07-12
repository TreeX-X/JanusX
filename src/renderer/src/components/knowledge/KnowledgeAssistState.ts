import type { KnowledgeContextRequest } from '../../../../shared/knowledge'

export const ASSIST_MAX_ITEMS = 8
export const ASSIST_MAX_CHARS = 3000

export function createAssistRequest(
  query: string,
  workspaceId: string | null,
  workspacePath: string | null,
): KnowledgeContextRequest | null {
  const trimmed = query.trim()
  if (!trimmed || (!workspaceId && !workspacePath)) return null
  return {
    query: trimmed,
    workspaceId: workspaceId || undefined,
    workspacePath: workspacePath || undefined,
    maxItems: ASSIST_MAX_ITEMS,
    maxChars: ASSIST_MAX_CHARS,
  }
}

export class AssistRequestGate {
  private version = 0

  begin(): number {
    this.version += 1
    return this.version
  }

  invalidate(): void {
    this.version += 1
  }

  isCurrent(version: number): boolean {
    return version === this.version
  }
}
