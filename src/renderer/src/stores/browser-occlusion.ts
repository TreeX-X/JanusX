import { create } from 'zustand'

// Window-local: overlapping dialogs each own a lease until their exit completes.
export const useBrowserOcclusionStore = create<{ count: number }>(() => ({ count: 0 }))

export function acquireBrowserOcclusion(): () => void {
  useBrowserOcclusionStore.setState((state) => ({ count: state.count + 1 }))
  let released = false
  return () => {
    if (released) return
    released = true
    useBrowserOcclusionStore.setState((state) => ({ count: state.count - 1 }))
  }
}
