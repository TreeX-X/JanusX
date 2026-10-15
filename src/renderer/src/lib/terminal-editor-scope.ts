function identityPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
  return /^[a-z]:(\/|$)/i.test(normalized) || normalized.startsWith('//')
    ? normalized.toLowerCase()
    : normalized
}

// Note: island and file tree share the owning scope's native editor window — see .agents/notes/terminal/terminal-right-island-turn-history.md
export function resolveTerminalEditorScope(cwd: string, scopePaths: (string | undefined)[]): string {
  const directory = identityPath(cwd)
  let bestPath = cwd
  let bestLength = -1
  for (const path of scopePaths) {
    if (!path) continue
    const scope = identityPath(path)
    const prefix = scope.endsWith('/') ? scope : `${scope}/`
    if (scope.length > bestLength && (directory === scope || directory.startsWith(prefix))) {
      bestPath = path
      bestLength = scope.length
    }
  }
  return bestPath
}
