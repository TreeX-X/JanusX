import { useLayoutEffect } from 'react'
import { acquireBrowserOcclusion } from '@/stores/browser-occlusion'

/** Native web views cannot be covered by a DOM dialog's z-index. */
export function useBrowserOcclusion(active: boolean): void {
  useLayoutEffect(() => {
    if (active) return acquireBrowserOcclusion()
  }, [active])
}
