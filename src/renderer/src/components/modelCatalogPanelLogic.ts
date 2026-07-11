import type { AiModelRegistryEntry, ModelCatalogSnapshot } from '@janusx/llm-core'

export const UNKNOWN_VENDOR = 'Unknown'

export interface ModelCatalogGroup {
  vendor: string
  models: AiModelRegistryEntry[]
}

export type ModelCatalogEmptyState = 'load-error' | 'empty-catalog' | 'no-results' | null

export function groupModels(models: AiModelRegistryEntry[], rawQuery: string): ModelCatalogGroup[] {
  const query = rawQuery.trim().toLocaleLowerCase()
  const groups = new Map<string, AiModelRegistryEntry[]>()

  for (const model of models) {
    if (query && !model.name.toLocaleLowerCase().includes(query) && !model.id.toLocaleLowerCase().includes(query)) {
      continue
    }

    const vendor = model.providerAuthor?.trim() || UNKNOWN_VENDOR
    const group = groups.get(vendor) ?? []
    group.push(model)
    groups.set(vendor, group)
  }

  return Array.from(groups, ([vendor, groupedModels]) => ({
    vendor,
    models: groupedModels.sort((a, b) => a.name.localeCompare(b.name)),
  })).sort((a, b) => {
    if (a.vendor === UNKNOWN_VENDOR) return 1
    if (b.vendor === UNKNOWN_VENDOR) return -1
    return a.vendor.localeCompare(b.vendor)
  })
}

export function buildCapabilityList(model: AiModelRegistryEntry): string[] {
  return dedupe(model.supportedParameters ?? [])
}

export function catalogEmptyState(
  loading: boolean,
  catalog: ModelCatalogSnapshot | null,
  loadError: string | null,
  resultCount: number,
  hasQuery: boolean,
): ModelCatalogEmptyState {
  if (loading) return null
  if (loadError && !catalog) return 'load-error'
  if (!catalog || catalog.models.length === 0) return 'empty-catalog'
  return resultCount === 0 && hasQuery ? 'no-results' : null
}

export function formatList(value?: string[]): string | undefined {
  return value?.length ? dedupe(value).join(' / ') : undefined
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}
