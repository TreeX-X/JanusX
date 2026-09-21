import type { ShellRestoreManifest } from '../../../shared/ipc/session'
import { launchTerminalPreset } from '@/lib/terminal-launch'
import { useWorkspaceStore } from '@/stores/workspace'

/** Snapshot live plus snapshotted terminals as shell-restore entries. */
export function collectShellRestore(): ShellRestoreManifest {
  const { activeWorkspaceId, workspaces, terminals, terminalSnapshots } = useWorkspaceStore.getState()
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    workspaces: workspaces.map((workspace) => {
      const live = workspace.id === activeWorkspaceId
        ? terminals.filter((terminal) => terminal.workspaceId === workspace.id)
        : []
      const snapshotted = terminalSnapshots[workspace.id]?.terminals ?? []
      const seen = new Map<string, { cwd: string; preset: string; name: string }>()
      for (const terminal of [...live, ...snapshotted]) {
        if (!terminal.cwd || seen.has(terminal.id)) continue
        seen.set(terminal.id, { cwd: terminal.cwd, preset: terminal.preset, name: terminal.name })
      }
      return { workspaceId: workspace.id, terminals: [...seen.values()] }
    }),
  }
}

export async function saveShellRestore(): Promise<void> {
  await window.electron.session.saveLayout(collectShellRestore())
}

/**
 * One-shot cold restore: recreate recorded terminals as shells (agents
 * never auto-run), then consume the manifest so it cannot replay.
 * Skips silently when the user already has terminals.
 */
export async function restoreShells(): Promise<number> {
  const manifest = await window.electron.session.getLayout().catch(() => null)
  if (!manifest) return 0
  const { workspaces, terminals } = useWorkspaceStore.getState()
  if (terminals.length > 0) {
    await window.electron.session.clearLayout().catch(() => undefined)
    return 0
  }
  let restored = 0
  for (const entry of manifest.workspaces) {
    const workspace = workspaces.find((item) => item.id === entry.workspaceId)
    if (!workspace) continue
    for (const terminal of entry.terminals) {
      try {
        const result = await launchTerminalPreset({
          preset: 'shell',
          workspaceId: workspace.id,
          workspacePath: workspace.path,
          cwd: terminal.cwd,
          name: terminal.name,
          enterTerminalUi: false,
        })
        if (result?.ok) restored += 1
      } catch {
        // One bad shell never blocks the rest.
      }
    }
  }
  await window.electron.session.clearLayout().catch(() => undefined)
  return restored
}
