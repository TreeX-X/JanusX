import { create } from 'zustand'
import {
  EXPERIMENTAL_ENABLED_ALL,
  normalizeExperimentalFeatures,
  type ExperimentalFeatures,
} from '../../../shared/ipc/experimental'
import { getExperimentalFeatures } from '@/services/experimental-features'

interface ExperimentalStore extends ExperimentalFeatures {
  /** 主进程持久化值是否已载入；载入前保持全开，避免旧用例与预览误杀。 */
  loaded: boolean
  load: () => Promise<void>
  apply: (features: Partial<ExperimentalFeatures>) => void
}

let loadPromise: Promise<void> | null = null

export const useExperimentalStore = create<ExperimentalStore>()((set, get) => ({
  ...EXPERIMENTAL_ENABLED_ALL,
  loaded: false,
  load: () => {
    if (get().loaded) return Promise.resolve()
    if (loadPromise) return loadPromise
    loadPromise = (async () => {
      try {
        const api = window.electron?.experimental
        if (!api) {
          set({ ...EXPERIMENTAL_ENABLED_ALL, loaded: true })
          return
        }
        set({ ...normalizeExperimentalFeatures(await getExperimentalFeatures()), loaded: true })
      } catch {
        // 无 IPC / 网关垫片拒绝时降级为全开，入口保持可见。
        set({ ...EXPERIMENTAL_ENABLED_ALL, loaded: true })
      }
    })()
    return loadPromise
  },
  apply: (features) => set({ ...normalizeExperimentalFeatures({ ...get(), ...features }) }),
}))
