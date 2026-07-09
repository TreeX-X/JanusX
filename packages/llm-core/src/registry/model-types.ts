/**
 * @file AI model registry types
 * @description Shared schema for generated and runtime model metadata.
 */

export type ModelRegistrySource = 'openrouter'

export interface AiModelRegistryEntry {
  id: string
  canonicalSlug?: string
  name: string
  description?: string
  source: ModelRegistrySource
  providerAuthor?: string
  createdAt?: string
  createdUnix?: number

  contextLength?: number
  providerContextLength?: number
  effectiveContextWindow?: number
  maxOutputTokens?: number

  inputModalities?: string[]
  outputModalities?: string[]
  tokenizer?: string
  supportedParameters?: string[]

  promptPricePerToken?: string
  completionPricePerToken?: string

  aliases: string[]
  normalizedKeys: string[]
  raw?: unknown
}

export interface AiModelRegistryDocument {
  schemaVersion: number
  source: ModelRegistrySource
  updatedAt: string
  cutoffCreatedAt: string
  modelCount: number
  models: AiModelRegistryEntry[]
}

export interface AiModelRegistryOverride {
  id: string
  source?: ModelRegistrySource
  name?: string
  description?: string
  canonicalSlug?: string
  aliases?: string[]
  contextLength?: number
  providerContextLength?: number
  effectiveContextWindow?: number
  maxOutputTokens?: number
  inputModalities?: string[]
  outputModalities?: string[]
  supportedParameters?: string[]
}

export interface AiModelRegistryOverridesDocument {
  schemaVersion: number
  overrides: AiModelRegistryOverride[]
}

export type AiModelMatchConfidence = 'exact' | 'high' | 'medium' | 'low' | 'none'

export interface AiModelMatchResult {
  match: AiModelRegistryEntry | null
  confidence: AiModelMatchConfidence
  candidates: AiModelRegistryEntry[]
}

export interface OpenRouterModelRecord {
  id?: string
  name?: string
  created?: number
  description?: string
  context_length?: number
  top_provider?: {
    context_length?: number
    max_completion_tokens?: number
  }
  architecture?: {
    input_modalities?: string[]
    output_modalities?: string[]
    tokenizer?: string
  }
  supported_parameters?: string[]
  pricing?: {
    prompt?: string
    completion?: string
  }
}
