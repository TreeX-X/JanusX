import type { LanguageServiceDescriptor, LanguageServiceId, NativeSourceLanguage } from '../../shared/ipc/language-service'
import { clangdDescriptor } from './descriptors/clangd'

const descriptors: Map<LanguageServiceId, LanguageServiceDescriptor> = new Map()

function register(descriptor: LanguageServiceDescriptor): void {
  descriptors.set(descriptor.id, descriptor)
}

register(clangdDescriptor)

export function getDescriptor(serviceId: LanguageServiceId): LanguageServiceDescriptor {
  const descriptor = descriptors.get(serviceId)
  if (!descriptor) throw new Error(`Unknown language service: ${serviceId}`)
  return descriptor
}

export function getDescriptorByLanguage(language: NativeSourceLanguage): LanguageServiceDescriptor | undefined {
  for (const descriptor of descriptors.values()) {
    if (descriptor.languages.includes(language)) return descriptor
  }
  return undefined
}

export function getAllDescriptors(): readonly LanguageServiceDescriptor[] {
  return [...descriptors.values()]
}