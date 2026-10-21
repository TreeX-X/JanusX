import { WindowControls } from '../WindowControls'
import { useCallback, useEffect, useMemo } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { BrowserSurface } from './BrowserSurface'
import { embedBrowserSurface } from '@/services/browser'
import { useThemeStore } from '@/stores/theme'
import { useI18n } from '@/i18n/useI18n'
import { ThemedTooltip } from '@/components/ui/ThemedTooltip'
import styles from './StandaloneBrowser.module.css'

/**
 * 浏览器独立窗口壳：frameless 标题栏（平台窗口控制 + 嵌入主窗口）+ 整窗 BrowserSurface。
 * 关闭窗口即销毁 surface（主进程监听 closed）；嵌入由主进程 re-parent 后关窗。
 */
export function StandaloneBrowser() {
  const { t } = useI18n('common')
  const surfaceId = useMemo(() => new URLSearchParams(window.location.search).get('surfaceId'), [])

  useEffect(() => {
    void useThemeStore.getState().load()
  }, [])

  const handleEmbed = useCallback(() => {
    if (!surfaceId) return
    /*-- 主进程 embed 成功后会自行关闭本窗口，无需渲染端再关 --*/
    void embedBrowserSurface(surfaceId)
  }, [surfaceId])

  if (!surfaceId) {
    return <div className={styles.missing}>{t('common:browser.missingSurfaceId')}</div>
  }

  return (
    <div className={styles.window}>
      <div className={styles.titlebar}>
        <WindowControls />
        <span className={styles.title}>{t('common:browser.title')}</span>
        <ThemedTooltip label={t('common:browser.embedToMain')}>
          <button type="button" className={styles.embedBtn} onClick={handleEmbed} aria-label={t('common:browser.embedToMain')}>
            <PanelRightOpen size={15} aria-hidden="true" />
          </button>
        </ThemedTooltip>
      </div>
      <div className={styles.body}>
        <BrowserSurface surfaceId={surfaceId} carrier="window" visible />
      </div>
    </div>
  )
}
