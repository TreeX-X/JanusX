import { createContext, useContext, type ReactNode } from 'react'
import {
  useJanusChat,
  type UseJanusChatRegistryReturn,
  type UseJanusChatReturn,
} from './useJanusChat'

const JanusChatContext = createContext<UseJanusChatRegistryReturn | null>(null)

export function JanusChatProvider({ children }: { children: ReactNode }) {
  const registry = useJanusChat()
  return <JanusChatContext.Provider value={registry}>{children}</JanusChatContext.Provider>
}

export function useJanusChatController(conversationId?: string): UseJanusChatReturn {
  const registry = useContext(JanusChatContext)
  if (!registry) throw new Error('useJanusChatController must be used within JanusChatProvider')
  return registry.getController(conversationId)
}

export function useOptionalJanusChatController(): UseJanusChatReturn | null {
  const registry = useContext(JanusChatContext)
  return registry?.getController() ?? null
}
