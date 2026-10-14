import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, SquareTerminal, Star, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import {
  isShellEntryLaunchable,
  parseCommandLine,
  quoteCommandToken,
  shellEntryExecutable,
  type ShellCandidate,
  type ShellProfileEntry,
  type ShellProfilesSettings,
} from '../../../shared/shellProfiles'
import { useShellProfilesStore } from '@/stores/shell-profiles'
import { ExternalCliManager } from './ExternalCliManager'
import {
  EXTERNAL_CLI_TOOL_ORDER,
  type ExternalCliToolId,
} from '../../../shared/ipc/external-cli'
import styles from './AppSettingsModal.module.css'

/** 标红时显示的可执行名：命令首个 token，命令为空时退回整条命令。 */
function executableOf(entry: ShellProfileEntry): string {
  const tokens = parseCommandLine(entry.command)
  return tokens.length > 0 ? tokens[0] : entry.command
}

/** persist 只收要改的字段，其余与当前设置合并，调用点不必反复重述。 */
type TerminalSettingsPatch = Partial<Pick<ShellProfilesSettings, 'entries' | 'hiddenCliPresets'>>

/**
 * 设置「终端管理」。布局沿用设置界面的 label + control 两栏（generalRow），
 * 三个区块：用户自建 shell 条目、外部 CLI（检测/安装 + 新建入口显隐）、检测候选区。
 */
export function TerminalManagerPanel() {
  const { t } = useI18n('terminal')
  const settings = useShellProfilesStore((s) => s.settings)
  const load = useShellProfilesStore((s) => s.load)
  const save = useShellProfilesStore((s) => s.save)
  const detect = useShellProfilesStore((s) => s.detect)
  const [candidates, setCandidates] = useState<ShellCandidate[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const persist = useCallback(
    async (patch: TerminalSettingsPatch) => {
      setSaveError(null)
      try {
        await save({ ...settings, ...patch })
      } catch {
        setSaveError(t('terminal:shellSettings.saveError'))
      }
    },
    [save, settings, t],
  )

  const scanCandidates = useCallback(async () => {
    setScanning(true)
    try {
      setCandidates(await detect())
    } catch {
      setCandidates([])
    } finally {
      setScanning(false)
    }
  }, [detect])

  // 标红依据：扫描过的可执行名集合里找不到该条目的可执行名。
  const detectedExecutables = useMemo(() => {
    if (!candidates) return null
    return new Set(candidates.filter((candidate) => candidate.path).map((candidate) => candidate.executable))
  }, [candidates])

  const patchEntry = (id: string, patch: Partial<ShellProfileEntry>) => {
    void persist({
      entries: settings.entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    })
  }

  const removeEntry = (id: string) => {
    void persist({
      entries: settings.entries.filter((entry) => entry.id !== id),
    })
  }

  const addEntry = () => {
    const entry: ShellProfileEntry = {
      id: crypto.randomUUID(),
      name: t('terminal:shellSettings.configured.newName'),
      command: '',
      visible: true,
      isDefault: false,
    }
    void persist({
      entries: [...settings.entries, entry],
    })
  }

  const addCandidate = (candidate: ShellCandidate) => {
    const entry: ShellProfileEntry = {
      id: crypto.randomUUID(),
      name: candidate.suggestedName,
      // 检测到的绝对路径可能带空格（Program Files），预填时必须加引号才能整体解析。
      command: quoteCommandToken(candidate.path ?? candidate.executable),
      ...(candidate.suggestedSuffix ? { suffix: candidate.suggestedSuffix } : {}),
      visible: true,
      isDefault: false,
    }
    void persist({
      entries: [...settings.entries, entry],
    })
  }

  const setCliVisible = (toolId: ExternalCliToolId, visible: boolean) => {
    void persist({
      entries: settings.entries,
      hiddenCliPresets: visible
        ? settings.hiddenCliPresets.filter((item) => item !== toolId)
        : [...settings.hiddenCliPresets, toolId],
    })
  }

  return (
    <div className={styles.generalPanel}>
      {/* ── 已配置 shell 条目 ── */}
      <div className={styles.generalRow}>
        <div className={styles.generalLabelCol}>
          <div className={styles.generalLabel}>{t('terminal:shellSettings.configured.title')}</div>
          <div className={styles.generalHelp}>{t('terminal:shellSettings.configured.help')}</div>
        </div>
        <div className={styles.generalControlCol}>
          <div className={styles.lsSection}>
            {settings.entries.length === 0 && (
              <div className={styles.lsEmpty}>{t('terminal:shellSettings.configured.empty')}</div>
            )}
            {settings.entries.map((entry) => (
              <ShellEntryCard
                key={entry.id}
                entry={entry}
                missing={
                  detectedExecutables !== null && !detectedExecutables.has(shellEntryExecutable(entry))
                }
                onPatch={patchEntry}
                onRemove={removeEntry}
                onMakeDefault={() =>
                  void persist({
                    entries: settings.entries.map((item) => ({
                      ...item,
                      isDefault: item.id === entry.id,
                    })),
                  })
                }
                onRedetect={() => void scanCandidates()}
              />
            ))}
            {/* 列表末尾的整宽虚线行：读作"下一张空卡位"，而不是浮在底色上的孤钮 */}
            <button type="button" className={styles.lsAddRow} onClick={addEntry}>
              <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
              {t('terminal:shellSettings.configured.add')}
            </button>
          </div>
        </div>
      </div>

      {/* ── 外部 CLI：检测/安装 + 新建入口显隐（自「通用」移来） ── */}
      <div className={styles.generalRow}>
        <div className={styles.generalLabelCol}>
          <div className={styles.generalLabel}>{t('terminal:shellSettings.externalCli.title')}</div>
          <div className={styles.generalHelp}>{t('terminal:shellSettings.externalCli.help')}</div>
        </div>
        <div className={styles.generalControlCol}>
          <div className={styles.lsCard}>
            {EXTERNAL_CLI_TOOL_ORDER.map((toolId) => (
              <ExternalCliManager
                key={toolId}
                toolId={toolId}
                visible={!settings.hiddenCliPresets.includes(toolId)}
                onVisibleChange={(visible) => setCliVisible(toolId, visible)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── 检测候选区：扫描按钮与候选列表同住一张卡 ── */}
      <div className={styles.generalRow}>
        <div className={styles.generalLabelCol}>
          <div className={styles.generalLabel}>{t('terminal:shellSettings.candidates.title')}</div>
          <div className={styles.generalHelp}>{t('terminal:shellSettings.candidates.help')}</div>
        </div>
        <div className={styles.generalControlCol}>
          <div className={styles.lsCard}>
            <div className={styles.lsCardHeader}>
              <div className={styles.lsCardInfo}>
                <span className={styles.lsCardDesc}>
                  {candidates === null
                    ? t('terminal:shellSettings.candidates.idle')
                    : t('terminal:shellSettings.candidates.count', { count: candidates.length })}
                </span>
              </div>
              <div className={styles.lsCardActions}>
                {/* 只留图标：文字在 label 栏与 aria-label 里都有了 */}
                <button
                  type="button"
                  className={`${styles.lsIconButton}${scanning ? ` ${styles.lsIconSpin}` : ''}`}
                  aria-label={t('terminal:shellSettings.candidates.scan')}
                  title={t('terminal:shellSettings.candidates.scan')}
                  disabled={scanning}
                  onClick={() => void scanCandidates()}
                >
                  <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            </div>

            {candidates !== null && candidates.length === 0 && (
              <div className={styles.lsEmpty}>{t('terminal:shellSettings.candidates.empty')}</div>
            )}
            {candidates?.map((candidate) => (
              <div key={candidate.executable} className={styles.lsToolRow}>
                <div className={styles.lsToolRowMain}>
                  <div className={styles.lsToolRowInfo}>
                    <span className={styles.lsCardName}>{candidate.suggestedName}</span>
                    <span className={styles.lsToolRowMeta}>
                      {[candidate.path ?? candidate.executable, candidate.suggestedSuffix]
                        .filter(Boolean)
                        .join('  ')}
                    </span>
                  </div>
                  {candidate.configured ? (
                    <span className={`${styles.lsStateBadge} ${styles.lsStateIdle}`}>
                      {t('terminal:shellSettings.candidates.configured')}
                    </span>
                  ) : (
                    <span className={styles.lsToolRowActions}>
                      <button
                        type="button"
                        className={`${styles.lsButton} ${styles.lsButtonPrimary}`}
                        onClick={() => addCandidate(candidate)}
                      >
                        {t('terminal:shellSettings.candidates.add')}
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {saveError && <div className={styles.lsCardError}>{saveError}</div>}
    </div>
  )
}

/** 单条 shell 条目：就地编辑；图标即显隐开关（置灰 = 不进新建入口）。 */
function ShellEntryCard({
  entry,
  missing,
  onPatch,
  onRemove,
  onMakeDefault,
  onRedetect,
}: {
  entry: ShellProfileEntry
  missing: boolean
  onPatch: (id: string, patch: Partial<ShellProfileEntry>) => void
  onRemove: (id: string) => void
  onMakeDefault: () => void
  onRedetect: () => void
}) {
  const { t } = useI18n('terminal')

  return (
    <div className={styles.lsCard}>
      <div className={styles.lsCardHeader}>
        {/* 固定终端字形；点它切换显隐，置灰即不从新建入口显示 */}
        <button
          type="button"
          className={`${styles.lsIconToggle} ${styles.lsIconEntry}${entry.visible ? '' : ` ${styles.lsIconToggleOff}`}`}
          aria-label={
            entry.visible
              ? t('terminal:shellSettings.visibility.visible')
              : t('terminal:shellSettings.visibility.hidden')
          }
          aria-pressed={entry.visible}
          title={
            entry.visible
              ? t('terminal:shellSettings.visibility.visible')
              : t('terminal:shellSettings.visibility.hidden')
          }
          onClick={() => onPatch(entry.id, { visible: !entry.visible })}
        >
          <SquareTerminal size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <input
          className={`${styles.lsInput} ${styles.lsInputName}`}
          value={entry.name}
          placeholder={t('terminal:shellSettings.configured.newName')}
          aria-label={t('terminal:shellSettings.configured.name')}
          onChange={(event) => onPatch(entry.id, { name: event.target.value })}
        />

        <div className={styles.lsCardActions}>
          {/* 实色星 = 默认项；草稿（无命令）不可设为默认 */}
          <button
            type="button"
            className={`${styles.lsIconToggle}${entry.isDefault ? ` ${styles.lsIconToggleOn}` : ` ${styles.lsIconToggleOff}`}`}
            aria-label={t('terminal:shellSettings.visibility.default')}
            aria-pressed={entry.isDefault}
            disabled={!isShellEntryLaunchable(entry)}
            title={t('terminal:shellSettings.visibility.default')}
            onClick={onMakeDefault}
          >
            <Star size={14} strokeWidth={1.8} fill={entry.isDefault ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className={styles.lsIconButton}
            aria-label={t('terminal:shellSettings.configured.remove')}
            onClick={() => onRemove(entry.id)}
          >
            <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.lsFields}>
        <label className={styles.lsField}>
          <span className={styles.lsFieldLabel}>{t('terminal:shellSettings.configured.command')}</span>
          <input
            className={`${styles.lsInput}${missing ? ` ${styles.lsInputMissing}` : ''}`}
            value={entry.command}
            placeholder="bash --login -i"
            spellCheck={false}
            onChange={(event) => onPatch(entry.id, { command: event.target.value })}
          />
        </label>
        <label className={styles.lsField}>
          <span className={styles.lsFieldLabel}>{t('terminal:shellSettings.configured.suffix')}</span>
          <input
            className={`${styles.lsInput}`}
            value={entry.suffix ?? ''}
            placeholder="--login -i"
            spellCheck={false}
            onChange={(event) => onPatch(entry.id, { suffix: event.target.value })}
          />
        </label>
      </div>

      {missing && (
        <div className={styles.lsMissingRow}>
          <span className={styles.lsMissingText}>
            {t('terminal:shellSettings.configured.missing', { executable: executableOf(entry) })}
          </span>
          <button type="button" className={styles.lsLinkButton} onClick={onRedetect}>
            {t('terminal:shellSettings.configured.redetect')}
          </button>
          <button
            type="button"
            className={styles.lsLinkButton}
            onClick={() => onPatch(entry.id, { visible: false })}
          >
            {t('terminal:shellSettings.configured.hide')}
          </button>
        </div>
      )}
    </div>
  )
}
