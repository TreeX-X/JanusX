import { useCallback, useMemo } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { BrowserSurface } from './BrowserSurface'
import { embedBrowserSurface } from '@/services/browser'
import styles from './StandaloneBrowser.module.css'

/**
 * 浏览器独立窗口壳：frameless 标题栏（红绿灯 + 嵌入主窗口）+ 整窗 BrowserSurface。
 * 关闭窗口即销毁 surface（主进程监听 closed）；嵌入由主进程 re-parent 后关窗。
 */
export function StandaloneBrowser() {
  const surfaceId = useMemo(() => new URLSearchParams(window.location.search).get('surfaceId'), [])

  const handleEmbed = useCallback(() => {
    if (!surfaceId) return
    /*-- 主进程 embed 成功后会自行关闭本窗口，无需渲染端再关 --*/
    void embedBrowserSurface(surfaceId)
  }, [surfaceId])

  if (!surfaceId) {
    return <div className={styles.missing}>Missing surfaceId</div>
  }

  return (
    <div className={styles.window}>
      <div className={styles.titlebar}>
        <div className={styles.traffic}>
          <button
            type="button"
            aria-label="Close"
            className={styles.close}
            onClick={() => window.electron.window.close()}
          />
          <button
            type="button"
            aria-label="Minimize"
            className={styles.minimize}
            onClick={() => window.electron.window.minimize()}
          />
          <button
            type="button"
            aria-label="Maximize"
            className={styles.maximize}
            onClick={() => window.electron.window.maximize()}
          />
        </div>
        <span className={styles.title}>JanusX Browser</span>
        <button type="button" className={styles.embedBtn} onClick={handleEmbed} title="嵌入主窗口">
          <PanelRightOpen size={12} />
          嵌入主窗口
        </button>
      </div>
      <div className={styles.body}>
        <BrowserSurface surfaceId={surfaceId} carrier="window" visible />
      </div>
    </div>
  )
}
