import { useCallback, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorktreeStore } from '@/stores/worktree'
import type { TerminalPreset } from '@/types'
import { getTerminalPresetMeta } from '../../../shared/terminalLaunch'
import {
  launchTerminalPreset,
  warmDefaultShellCache,
  warmTerminalCreatePath,
} from '@/lib/terminal-launch'
import { useI18n } from '@/i18n/useI18n'
import { TerminalPresetIcon } from './ui/TerminalPresetIcon'
import styles from './TerminalSelector.module.css'

interface TerminalOptionProps {
  preset: TerminalPreset
  name: string
  busy: boolean
  onClick: () => void
  onHover?: () => void
}

function TerminalOption({ preset, name, busy, onClick, onHover }: TerminalOptionProps) {
  const { t } = useI18n('terminal')
  return (
    <button
      type="button"
      disabled={busy}
      onClick={busy ? undefined : onClick}
      onMouseEnter={busy ? undefined : onHover}
      onFocus={busy ? undefined : onHover}
      className={`${styles.card}${busy ? ` ${styles.cardBusy}` : ''}`}
    >
      <span className={styles.iconWrap}>
        <TerminalPresetIcon preset={preset} className={styles.icon} />
      </span>
      <span className={styles.label}>
        {busy ? t('terminal:selector.starting') : name}
      </span>
    </button>
  )
}

export function TerminalSelector() {
  const { t } = useI18n('terminal')
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [launchingPreset, setLaunchingPreset] = useState<TerminalPreset | null>(null)

  useEffect(() => {
    warmDefaultShellCache()
    warmTerminalCreatePath()
  }, [])

  const handleSelect = useCallback(
    async (preset: TerminalPreset) => {
      if (!activeWorkspaceId || launchingPreset) return

      const workspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === activeWorkspaceId)
      if (!workspace) return

      setLaunchingPreset(preset)
      try {
        await launchTerminalPreset({
          preset,
          workspaceId: activeWorkspaceId,
          workspacePath: workspace.path,
          cwd: useWorktreeStore.getState().activePaths[activeWorkspaceId] ?? workspace.path,
        })
      } finally {
        setLaunchingPreset(null)
      }
    },
    [activeWorkspaceId, launchingPreset]
  )

  const handleHover = useCallback((preset: TerminalPreset) => {
    if (preset === 'shell') {
      warmDefaultShellCache()
      return
    }
    warmTerminalCreatePath([preset])
  }, [])

  return (
    <div
      className={`${styles.root} flex flex-col items-center justify-center h-full gap-6 px-4 py-8 sm:px-6 md:px-10`}
      style={{
        background: 'var(--bg-deep)',
      }}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-sm font-medium" style={{ color: 'var(--shell-muted)' }}>{t('terminal:selector.title')}</div>
        <div className="text-[11px] max-w-[520px] leading-relaxed" style={{ color: 'var(--shell-dim)' }}>
          {t('terminal:selector.hint')}
        </div>
      </div>
      <div className={styles.grid}>
        {(['shell', 'janus', 'claude', 'codex', 'opencode', 'pi', 'dsh'] as TerminalPreset[]).map((preset) => (
          <TerminalOption
            key={preset}
            preset={preset}
            name={getTerminalPresetMeta(preset).label}
            busy={launchingPreset === preset}
            onClick={() => handleSelect(preset)}
            onHover={() => handleHover(preset)}
          />
        ))}
      </div>
    </div>
  )
}
