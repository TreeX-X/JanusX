import { createContext, useContext, type ReactNode } from 'react'
import type { EngineeringContext } from '../../../../shared/ipc/janus-chat'
import {
  useJanusChat,
  type UseJanusChatRegistryReturn,
  type UseJanusChatReturn,
} from './useJanusChat'

const JanusChatContext = createContext<UseJanusChatRegistryReturn | null>(null)

export function useJanusChatRegistry(): UseJanusChatRegistryReturn {
  const registry = useContext(JanusChatContext)
  if (!registry) throw new Error('useJanusChatRegistry must be used within JanusChatProvider')
  return registry
}

export function JanusChatProvider({ children }: { children: ReactNode }) {
  const registry = useJanusChat()
  return <JanusChatContext.Provider value={registry}>{children}</JanusChatContext.Provider>
}

export function useJanusChatController(conversationId?: string): UseJanusChatReturn {
  const registry = useContext(JanusChatContext)
  if (!registry) throw new Error('useJanusChatController must be used within JanusChatProvider')
  return registry.getController(conversationId)
}

export function useOptionalJanusChatController(viewRef?: EngineeringContext['viewRef']): UseJanusChatReturn | null {
  const registry = useContext(JanusChatContext)
  if (registry && viewRef) {
    return registry.getController().conversations.map(({ id }) => registry.getController(id)).find((controller) =>
      controller.engineeringContext?.domain === 'project'
      && controller.engineeringContext.viewRef?.ownerRepoId === viewRef.ownerRepoId
      && controller.engineeringContext.viewRef?.viewId === viewRef.viewId) ?? null
  }
  return registry?.getController() ?? null
}
