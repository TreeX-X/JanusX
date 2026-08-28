import { createContext, useContext } from 'react'

export const BlueprintDetailPortalContext = createContext<HTMLDivElement | null>(null)

export function useBlueprintDetailPortal(): HTMLDivElement | null {
  return useContext(BlueprintDetailPortalContext)
}
