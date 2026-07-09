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
