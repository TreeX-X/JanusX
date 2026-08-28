export function buildVSCodeLaunchArgs(workspacePath: string, profilePath: string): string[] {
  return ['--new-window', `--user-data-dir=${profilePath}`, workspacePath]
}
