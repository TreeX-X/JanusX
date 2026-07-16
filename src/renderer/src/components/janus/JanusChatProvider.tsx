import { createContext, useContext, type ReactNode } from 'react'
import { useJanusChat, type UseJanusChatReturn } from './useJanusChat'

const JanusChatContext = createContext<UseJanusChatReturn | null>(null)

export function JanusChatProvider({ children }: { children: ReactNode }) {
  const controller = useJanusChat()
  return <JanusChatContext.Provider value={controller}>{children}</JanusChatContext.Provider>
}

export function useJanusChatController(): UseJanusChatReturn {
  const controller = useContext(JanusChatContext)
  if (!controller) throw new Error('useJanusChatController must be used within JanusChatProvider')
  return controller
}
