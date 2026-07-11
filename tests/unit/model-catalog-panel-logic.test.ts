import { readFile } from 'fs/promises'
import { describe, expect, it } from 'vitest'
import type { AiModelRegistryEntry, ModelCatalogSnapshot } from '@janusx/llm-core'
import {
  UNKNOWN_VENDOR,
  buildCapabilityList,
  catalogEmptyState,
  formatList,
  groupModels,
} from '../../src/renderer/src/components/modelCatalogPanelLogic'

describe('model catalog panel logic', () => {
  it('groups models by vendor with an unknown fallback and filters by name or id', () => {
    const models = [
      model('zeta/alpha', 'Alpha', 'zeta'),
      model('acme/beta', 'Beta', 'acme'),
      model('orphan/gamma', 'Gamma'),
    ]

    expect(groupModels(models, '')).toEqual([
      { vendor: 'acme', models: [models[1]] },
      { vendor: 'zeta', models: [models[0]] },
      { vendor: UNKNOWN_VENDOR, models: [models[2]] },
    ])
    expect(groupModels(models, 'BETA')).toEqual([
      { vendor: 'acme', models: [models[1]] },
    ])
    expect(groupModels(models, 'orphan/gamma')).toEqual([
      { vendor: UNKNOWN_VENDOR, models: [models[2]] },
    ])
  })

  it('renders every supported parameter as a deduplicated capability', () => {
    expect(buildCapabilityList({
      ...model('acme/tool-model', 'Tool Model', 'acme'),
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      supportedParameters: ['tools', 'tool_choice', 'reasoning', 'tools'],
    })).toEqual([
      'tools',
      'tool_choice',
      'reasoning',
    ])
  })

  it('distinguishes load errors from empty catalogs and no search results', () => {
    expect(catalogEmptyState(false, null, 'offline', 0, false)).toBe('load-error')
    expect(catalogEmptyState(false, snapshot([]), null, 0, false)).toBe('empty-catalog')
    expect(catalogEmptyState(false, snapshot([model('acme/beta', 'Beta')]), null, 0, true)).toBe('no-results')
    expect(catalogEmptyState(true, null, 'offline', 0, false)).toBeNull()
  })

  it('formats lists after trimming empty and duplicate values', () => {
    expect(formatList(['tools', ' tools ', '', 'reasoning'])).toBe('tools / reasoning')
  })

  it('keeps descriptions wrapped in the narrow layout', async () => {
    const css = await readFile('src/renderer/src/components/ModelCatalogPanel.module.css', 'utf8')
    expect(css).toContain('.description')
    expect(css).toContain('overflow-wrap: anywhere;')
    expect(css).toContain('@media (max-width: 720px)')
    expect(css).toContain('.details { grid-template-columns: 1fr; }')
  })
})

function model(id: string, name: string, providerAuthor?: string): AiModelRegistryEntry {
  return {
    id,
    name,
    source: 'openrouter',
    providerAuthor,
    aliases: [id],
    normalizedKeys: [id],
  }
}

function snapshot(models: AiModelRegistryEntry[]): ModelCatalogSnapshot {
  return {
    models,
    updatedAt: '2026-07-10T08:00:00.000Z',
    source: 'cache',
    isStale: false,
  }
}
