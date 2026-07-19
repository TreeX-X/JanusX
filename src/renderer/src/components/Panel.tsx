import { createContext, useContext, type ReactNode } from 'react'
import { RightDock, type RightDockProps } from './right-tools/RightDock'

const RightDockLayoutContext = createContext<RightDockProps>({
  effectiveCollapsed: false,
  effectiveMaxWidth: 420,
  forcedCollapsed: false,
  onResizingChange: () => {},
})

export function RightDockLayoutProvider({
  children,
  ...layout
}: RightDockProps & { children: ReactNode }) {
  return <RightDockLayoutContext.Provider value={layout}>{children}</RightDockLayoutContext.Provider>
}

export function Panel() {
  return <RightDock {...useContext(RightDockLayoutContext)} />
}
