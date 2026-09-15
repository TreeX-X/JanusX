const CJK_PATTERN = /[\u3400-\u9fff]/

export function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_./\\:-]+/g, ' ')

  const tokens: string[] = []
  let current = ''

  for (const char of normalized) {
    if (/[a-z0-9]/.test(char)) {
      current += char
      continue
    }

    if (current) {
      tokens.push(current)
      current = ''
    }

    if (CJK_PATTERN.test(char)) {
      tokens.push(char)
    }
  }

  if (current) tokens.push(current)

  return tokens.filter((token) => token.length > 0)
}

export function uniqueTerms(tokens: string[]): string[] {
  return Array.from(new Set(tokens))
}

const CJK_SINGLE_PATTERN = /[\u3400-\u9fff]/

/**
 * User memory M3: tokens carrying forget weight — multi-character terms plus
 * single CJK characters. Single ASCII characters carry no weight.
 */
export function forgettingTokens(text: string): string[] {
  return tokenize(text).filter((token) => token.length >= 2 || CJK_SINGLE_PATTERN.test(token))
}

/**
 * User memory M3: breadth guard for destructive forget. A query forgets only
 * when it carries a multi-character term or at least two CJK characters, so a
 * lone particle can never expire the whole timeline.
 */
export function isForgettableQuery(query: string): boolean {
  const tokens = forgettingTokens(query.trim())
  if (tokens.length === 0) return false
  if (tokens.some((token) => token.length >= 2)) return true
  return tokens.length >= 2
}

/**
 * User memory M3: substantive overlap between a forget query and one document.
 * One shared multi-character term or at least two shared CJK characters count;
 * a lone shared particle never authorizes destruction.
 */
export function matchesForgettingQuery(query: string, documentText: string): boolean {
  const queryTokens = new Set(forgettingTokens(query))
  if (queryTokens.size === 0) return false
  const documentTokens = new Set(forgettingTokens(documentText))
  const shared = [...queryTokens].filter((token) => documentTokens.has(token))
  return shared.some((token) => token.length >= 2) || shared.length >= 2
}
