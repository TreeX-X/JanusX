/**
 * @file AI model name normalization
 * @description Builds stable keys used by exact, alias, and fuzzy matching.
 */

const NOISE_WORDS = new Set([
  'preview',
  'latest',
  'beta',
  'alpha',
  'chat',
  'instruct'
])

export function normalizeModelKey(value: string): string {
  return tokenizeModelName(value).join(' ')
}

export function compactModelKey(value: string): string {
  return tokenizeModelName(value).join('')
}

export function tokenizeModelName(value: string): string[] {
  const withoutProvider = value
    .toLowerCase()
    .replace(/^[a-z0-9_.-]+\//, '')
    .replace(/:free$/u, '')
    .replace(/[._/:-]+/gu, ' ')
    .replace(/([a-z])(\d)/gu, '$1 $2')
    .replace(/(\d)([a-z])/gu, '$1 $2')

  return withoutProvider
    .split(/\s+/u)
    .map(token => token.trim())
    .filter(token => token.length > 0 && !NOISE_WORDS.has(token))
}

export function providerAuthorFromId(id: string): string | undefined {
  const index = id.indexOf('/')
  if (index <= 0) return undefined
  return id.slice(0, index)
}

export function buildModelAliases(id: string, name: string, existing: string[] = []): string[] {
  const aliases = new Set<string>()
  const providerlessId = id.replace(/^[^/]+\//u, '').replace(/:free$/u, '')

  for (const value of [id, providerlessId, name, ...existing]) {
    const trimmed = value.trim()
    if (trimmed) aliases.add(trimmed)
  }

  const dateMatch = id.match(/(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/u)
  if (dateMatch?.[1] && dateMatch[2] && dateMatch[3]) {
    aliases.add(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`)
    aliases.add(`${dateMatch[2]}${dateMatch[3]}`)
  }

  return Array.from(aliases).sort()
}

export function buildNormalizedKeys(id: string, name: string, aliases: string[] = []): string[] {
  const keys = new Set<string>()

  for (const value of [id, name, ...aliases]) {
    const normalized = normalizeModelKey(value)
    const compact = compactModelKey(value)
    if (normalized) keys.add(normalized)
    if (compact) keys.add(compact)
  }

  return Array.from(keys).sort()
}
