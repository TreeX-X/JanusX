import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Globe } from 'lucide-react'
import { ThemedTooltip } from './ui/ThemedTooltip'
import { MarkdownIcon } from './ui/MarkdownIcon'
import { useWorkspaceStore } from '@/stores/workspace'
import { useExperimentalStore } from '@/stores/experimental'
import { openGlobalTool, resolveGlobalToolOpenState } from '@/lib/global-tool-entry'
import { useI18n } from '@/i18n/useI18n'
import styles from './TitlebarToolGroup.module.css'

/**
 * 顶栏全局工具入口：一个可展开的工具菜单（浏览器 / Markdown）。
 *
 * 两个目标都是"打开中央内容"，与终端流程解耦——没有终端、没有项目时同样可达。
 * 主操作一律走 {@link openGlobalTool}：先翻回工作区正面并收起遮挡的工作台，再打开目标 pane。
 * 入口收成一个控件：点击展开菜单再选择开哪个，与 TerminalSelector 的 ShellCard
 * 同一套"主控件 + 展开选择"语言。本组与蓝图/知识库工作台分组同排但由竖分隔线隔开
 * （见 markdown-pane-entry.md 的顶栏分组）。
 *
 * 每个工具在一个工作区里只开一个实例，所以菜单里"已开着"的条目直接置灰并带
 * "已打开"标记：关闭对应标签后恢复可点。不做重复点击只做聚焦的条目——分屏里
 * 想跳焦点可以直接点那个 pane。
 */
export function TitlebarToolGroup() {
  const { t } = useI18n()
  const openBrowserInWorkspace = useWorkspaceStore((s) => s.openBrowserInWorkspace)
  const openMarkdownInWorkspace = useWorkspaceStore((s) => s.openMarkdownInWorkspace)
  const paneTree = useWorkspaceStore((s) => s.paneTree)
  const [menuOpen, setMenuOpen] = useState(false)
  const comboRef = useRef<HTMLDivElement | null>(null)

  // 顶层 paneTree 就是当前屏幕上的那棵树：有项目时是该项目的工作区，无项目时是全局那棵。
  const openState = resolveGlobalToolOpenState(paneTree)

  // 展开后点外面或按 Esc 收起（与 ShellCard 的菜单同一套收合规则）。
  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!comboRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const pick = (open: () => void | Promise<void>) => {
    setMenuOpen(false)
    openGlobalTool(open)
  }

  return (
    <div className={styles.group} aria-label={t('common:toolGroup.aria')}>
      <div className={styles.combo} ref={comboRef}>
        <ThemedTooltip label={t('common:toolGroup.triggerAction')} disabled={menuOpen}>
          <button
            type="button"
            className={`${styles.trigger}${menuOpen ? ` ${styles.triggerOpen}` : ''}`}
            data-id="tool-menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t('common:toolGroup.triggerAction')}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Globe className={styles.icon} size={14} strokeWidth={1.5} aria-hidden="true" />
            <MarkdownIcon className={`${styles.icon} ${styles.markdownIcon}`} strokeWidth={1.75} aria-hidden="true" />
            <ChevronDown className={styles.chevron} size={11} strokeWidth={2} aria-hidden="true" />
          </button>
        </ThemedTooltip>

        {menuOpen && (
          <div className={styles.menu} role="menu" aria-label={t('common:toolGroup.aria')}>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              data-id="browser"
              disabled={openState.browser}
              title={openState.browser ? t('common:toolGroup.browserOpened') : t('common:toolGroup.browserAction')}
              aria-label={openState.browser ? t('common:toolGroup.browserOpened') : t('common:toolGroup.browserAction')}
              onClick={() => pick(() => openBrowserInWorkspace())}
            >
              <Globe className={styles.menuIcon} size={14} strokeWidth={1.5} aria-hidden="true" />
              <span className={styles.menuLabel}>{t('common:toolGroup.browser')}</span>
              {openState.browser && <span className={styles.menuBadge}>{t('common:toolGroup.openedBadge')}</span>}
            </button>

            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              data-id="markdown"
              disabled={openState.markdown}
              title={openState.markdown ? t('common:toolGroup.markdownOpened') : t('common:toolGroup.markdownAction')}
              aria-label={openState.markdown ? t('common:toolGroup.markdownOpened') : t('common:toolGroup.markdownAction')}
              onClick={() => pick(() => openMarkdownInWorkspace())}
            >
              <MarkdownIcon className={`${styles.menuIcon} ${styles.markdownIcon}`} strokeWidth={1.75} aria-hidden="true" />
              <span className={styles.menuLabel}>{t('common:toolGroup.markdown')}</span>
              {openState.markdown && <span className={styles.menuBadge}>{t('common:toolGroup.openedBadge')}</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** 工具组与工作台分组之间的竖分隔线；没有可见工作台按钮时收起。 */
export function TitlebarToolSeparator() {
  const blueprint = useExperimentalStore((s) => s.blueprint)
  const knowledge = useExperimentalStore((s) => s.persona)
  const loadExperimental = useExperimentalStore((s) => s.load)

  useEffect(() => {
    void loadExperimental()
  }, [loadExperimental])

  // 两个工作台开关都关掉时，右侧只剩工具组，分隔线没有可分的东西，收起。
  if (!blueprint && !knowledge) return null
  return <span className={styles.separator} aria-hidden="true" />
}
