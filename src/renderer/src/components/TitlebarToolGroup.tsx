import { useEffect } from 'react'
import { Globe } from 'lucide-react'
import { ThemedTooltip } from './ui/ThemedTooltip'
import { MarkdownIcon } from './ui/MarkdownIcon'
import { useWorkspaceStore } from '@/stores/workspace'
import { useExperimentalStore } from '@/stores/experimental'
import { openGlobalTool, resolveGlobalToolOpenState } from '@/lib/global-tool-entry'
import { useI18n } from '@/i18n/useI18n'
import styles from './TitlebarToolGroup.module.css'

/**
 * 顶栏全局工具组：浏览器 / Markdown。
 *
 * 两个入口都是"打开中央内容"，与终端流程解耦——没有终端、没有项目时同样可达。
 * 主操作一律走 {@link openGlobalTool}：先翻回工作区正面并收起遮挡的工作台，再打开目标 pane。
 * 本组与蓝图/知识库工作台分组同排但由竖分隔线隔开（见 markdown-pane-entry.md 的顶栏分组）。
 *
 * 每个工具在一个工作区里只开一个实例，所以"已开着"就直接置灰：关闭对应标签后恢复可点。
 * 这样比保留一个重复点击只做聚焦的按钮更简约——分屏里想跳焦点可以直接点那个 pane。
 */
export function TitlebarToolGroup() {
  const { t } = useI18n()
  const openBrowserInWorkspace = useWorkspaceStore((s) => s.openBrowserInWorkspace)
  const openMarkdownInWorkspace = useWorkspaceStore((s) => s.openMarkdownInWorkspace)
  const paneTree = useWorkspaceStore((s) => s.paneTree)

  // 顶层 paneTree 就是当前屏幕上的那棵树：有项目时是该项目的工作区，无项目时是全局那棵。
  const openState = resolveGlobalToolOpenState(paneTree)

  return (
    <div className={styles.group} aria-label={t('common:toolGroup.aria')}>
      <ThemedTooltip label={t('common:toolGroup.browserAction')} disabled={openState.browser}>
        <button
          type="button"
          className={styles.button}
          data-id="browser"
          disabled={openState.browser}
          aria-label={openState.browser ? t('common:toolGroup.browserOpened') : t('common:toolGroup.browserAction')}
          onClick={() => openGlobalTool(() => openBrowserInWorkspace())}
        >
          <Globe className={styles.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </ThemedTooltip>

      <ThemedTooltip label={t('common:toolGroup.markdownAction')} disabled={openState.markdown}>
        <button
          type="button"
          className={styles.button}
          data-id="markdown"
          disabled={openState.markdown}
          aria-label={openState.markdown ? t('common:toolGroup.markdownOpened') : t('common:toolGroup.markdownAction')}
          onClick={() => openGlobalTool(() => openMarkdownInWorkspace())}
        >
          <MarkdownIcon className={`${styles.icon} ${styles.markdownIcon}`} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </ThemedTooltip>
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
