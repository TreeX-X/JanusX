export function redactErrorText(
  error: unknown,
  credentials: readonly (string | null | undefined)[],
  maxLength: number,
): string {
  let value = error instanceof Error ? error.message : String(error)
  const variants = [...new Set(credentials.flatMap(credentialVariants))]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
  for (const variant of variants) value = value.split(variant).join('[redacted]')
  return value.replace(/[\r\n]+/g, ' ').slice(0, maxLength)
}

function credentialVariants(value: string | null | undefined): string[] {
  if (!value) return []
  const trimmed = value.trim()
  return [value, trimmed, collapseWhitespace(value), collapseWhitespace(trimmed)]
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
