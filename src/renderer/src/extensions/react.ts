import { useSyncExternalStore } from 'react'
import { extensionRegistry } from './registry'

export function useExtensionViews() {
  return useSyncExternalStore(extensionRegistry.subscribe, extensionRegistry.getSnapshot, extensionRegistry.getSnapshot)
}
