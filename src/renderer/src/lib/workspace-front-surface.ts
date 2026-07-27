import type { AppLoadState } from '@/types'

export function shouldRenderWorkspacePane(loadState: AppLoadState, hasPaneContent: boolean): boolean {
  return hasPaneContent || loadState === 'terminal-active'
}
