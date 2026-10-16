// Note: S1 registration and lifecycle contract — see .agents/notes/workbench/requirements/plugin-architecture-forms.md
import type { ExtensionDefinition, ExtensionViewId, RegisteredExtensionView } from './types'

const ID_PATTERN = /^[a-z][a-z0-9.-]*$/

interface ExtensionRegistration {
  definition: ExtensionDefinition
  views: readonly RegisteredExtensionView[]
  enabled: boolean
  activationId: number
  dispose?: () => void
}

/** Trusted in-code registrations only. This does not load external JavaScript. */
export class ExtensionRegistry {
  private registrations = new Map<string, ExtensionRegistration>()
  private listeners = new Set<() => void>()
  private views: readonly RegisteredExtensionView[] = []
  private nextActivationId = 0

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): readonly RegisteredExtensionView[] => this.views

  getView = (id: string): RegisteredExtensionView | undefined => this.views.find((view) => view.id === id)

  register(definition: ExtensionDefinition): () => void {
    if (!ID_PATTERN.test(definition.id)) throw new Error(`Invalid extension id: ${definition.id}`)
    if (this.registrations.has(definition.id)) throw new Error(`Duplicate extension: ${definition.id}`)
    const ids = new Set<string>()
    const views = definition.views.map((view): RegisteredExtensionView => {
      if (!ID_PATTERN.test(view.id) || ids.has(view.id)) throw new Error(`Invalid or duplicate view: ${view.id}`)
      if (!view.title.trim() || !['workspace', 'right'].includes(view.location)
        || !['application', 'project'].includes(view.scope)
        || (view.launcher !== undefined && (view.location !== 'workspace' || !['workspace-menu', 'tool-menu'].includes(view.launcher)))
        || (view.order !== undefined && !Number.isFinite(view.order))) throw new Error(`Invalid view: ${view.id}`)
      ids.add(view.id)
      return Object.freeze({ ...view, id: `extension:${definition.id}/${view.id}`, extensionId: definition.id, activationId: 0 })
    })
    const registration: ExtensionRegistration = { definition, views, enabled: false, activationId: 0 }
    this.registrations.set(definition.id, registration)
    try {
      this.enable(definition.id)
    } catch (error) {
      this.registrations.delete(definition.id)
      throw error
    }
    return () => {
      if (this.registrations.get(definition.id) !== registration) return
      try { this.disable(definition.id) } finally { this.registrations.delete(definition.id) }
    }
  }

  enable(id: string): void {
    const registration = this.registrations.get(id)
    if (!registration) throw new Error(`Unknown extension: ${id}`)
    if (registration.enabled) return
    const dispose = registration.definition.activate?.()
    registration.dispose = typeof dispose === 'function' ? dispose : undefined
    registration.enabled = true
    registration.activationId = ++this.nextActivationId
    this.publish()
  }

  disable(id: string): void {
    const registration = this.registrations.get(id)
    if (!registration?.enabled) return
    registration.enabled = false
    const dispose = registration.dispose
    registration.dispose = undefined
    // Remove contributions even when an extension's cleanup throws.
    try { dispose?.() } finally { this.publish() }
  }

  private publish(): void {
    this.views = Object.freeze([...this.registrations.values()]
      .filter((registration) => registration.enabled)
      .flatMap((registration) => registration.views.map((view) => Object.freeze({ ...view, activationId: registration.activationId })))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id)))
    for (const listener of this.listeners) {
      try { listener() } catch (error) { console.error('Extension registry subscriber failed', error) }
    }
  }
}

export const extensionRegistry = new ExtensionRegistry()

export function isExtensionViewId(id: string): id is ExtensionViewId {
  return /^extension:[a-z][a-z0-9.-]*\/[a-z][a-z0-9.-]*$/.test(id)
}
