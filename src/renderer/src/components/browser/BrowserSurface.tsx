import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  Loader2,
  PanelRightOpen,
  Plus,
  RotateCw,
  X,
} from 'lucide-react'
import { useBrowserStore } from '@/stores/browser'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  activateBrowserTab,
  closeBrowserTab,
  getBrowserSurfaceState,
  navigateBrowserTab,
  browserTabGoBack,
  browserTabGoForward,
  openBrowserTab,
  reloadBrowserTab,
  setBrowserSurfaceBounds,
} from '@/services/browser'
import styles from './BrowserSurface.module.css'

const ZERO_BOUNDS = { x: 0, y: 0, width: 0, height: 0 }

interface BrowserSurfaceProps {
  surfaceId: string
  carrier: 'pane' | 'window'
  /*-- pane 中非活动 tab 为 false：原生视图归零隐藏，组件保持挂载保活 --*/
  visible: boolean
  onRequestPopOut?: () => void
  onRequestEmbed?: () => void
}

/**
 * 双载体共用的浏览器 UI：tab 条 + 导航 + 地址栏 + bounds 上报占位层。
 * 网页本体是主进程持有的 WebContentsView，始终盖在 body 占位层上方。
 */
export function BrowserSurface({ surfaceId, carrier, visible, onRequestPopOut, onRequestEmbed }: BrowserSurfaceProps) {
  const surface = useBrowserStore((s) => s.surfaces[surfaceId])
  /*-- tab 拖拽期间隐藏原生视图：WebContentsView 盖在 DOM 之上会吞掉 dragover，落点区只有先让位才能命中 --*/
  const tabDragInFlight = useWorkspaceStore((s) => s.tabDragInFlight)
  const effectiveVisible = visible && !tabDragInFlight
  const [missing, setMissing] = useState(false)
  const [addressDraft, setAddressDraft] = useState('')
  const [addressFocused, setAddressFocused] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef(0)

  const activeTab = useMemo(
    () => surface?.tabs.find((tab) => tab.tabId === surface.activeTabId) ?? null,
    [surface],
  )

  /*-- 挂载时拉取一次最新状态：独立窗口首载、工作区切换回挂都靠它对齐 --*/
  useEffect(() => {
    let disposed = false
    void getBrowserSurfaceState(surfaceId).then((state) => {
      if (disposed) return
      if (state) useBrowserStore.getState().applySurfaceState(state)
      else setMissing(true)
    })
    return () => {
      disposed = true
    }
  }, [surfaceId])

  /*-- bounds 上报：ResizeObserver + window resize，rAF 节流；不可见则归零隐藏原生视图 --*/
  useEffect(() => {
    const node = bodyRef.current
    if (!node) return

    const report = (): void => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0
        if (!effectiveVisible) {
          void setBrowserSurfaceBounds(surfaceId, ZERO_BOUNDS)
          return
        }
        const rect = node.getBoundingClientRect()
        void setBrowserSurfaceBounds(surfaceId, {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })
      })
    }

    const observer = new ResizeObserver(report)
    observer.observe(node)
    window.addEventListener('resize', report)
    report()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
      /*-- 卸载隐藏：仅 pane 宿主组件且 store 载体仍为 pane（工作区切换等）时归零；
          独立窗口卸载（含 embed 后关窗）与已 popOut 的视图都不能动 --*/
      if (carrier === 'pane' && useBrowserStore.getState().surfaces[surfaceId]?.carrier === 'pane') {
        void setBrowserSurfaceBounds(surfaceId, ZERO_BOUNDS)
      }
    }
  }, [surfaceId, effectiveVisible, carrier])

  /*-- 地址栏草稿：未聚焦时跟随活动 tab 的 URL --*/
  useEffect(() => {
    if (!addressFocused) setAddressDraft(activeTab?.url ?? '')
  }, [activeTab?.url, addressFocused])

  const submitAddress = useCallback(() => {
    const url = addressDraft.trim()
    if (!url) return
    if (activeTab) void navigateBrowserTab(surfaceId, activeTab.tabId, url)
    else void openBrowserTab(surfaceId, url)
  }, [addressDraft, activeTab, surfaceId])

  if (missing) {
    return <div className={styles.missing}>Browser surface 已关闭</div>
  }

  const isEmpty = !surface || surface.tabs.length === 0

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div className={styles.tabs} role="tablist">
          {surface?.tabs.map((tab) => {
            const isActive = tab.tabId === surface.activeTabId
            return (
              <button
                key={tab.tabId}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-active={isActive}
                className={styles.tab}
                title={tab.title || tab.url || '新标签页'}
                onClick={() => void activateBrowserTab(surfaceId, tab.tabId)}
              >
                {tab.isLoading ? <Loader2 size={11} className={styles.spin} /> : <Globe size={11} />}
                <span className={styles.tabTitle}>{tab.title || tab.url || '新标签页'}</span>
                <span
                  className={styles.tabClose}
                  title="关闭标签页"
                  onClick={(event) => {
                    event.stopPropagation()
                    void closeBrowserTab(surfaceId, tab.tabId)
                  }}
                >
                  <X size={10} />
                </span>
              </button>
            )
          })}
          <button
            type="button"
            className={styles.iconBtn}
            title="新建标签页"
            aria-label="新建标签页"
            onClick={() => void openBrowserTab(surfaceId)}
          >
            <Plus size={12} />
          </button>
        </div>

        <button
          type="button"
          className={styles.iconBtn}
          title="后退"
          aria-label="后退"
          disabled={!activeTab?.canGoBack}
          onClick={() => activeTab && void browserTabGoBack(surfaceId, activeTab.tabId)}
        >
          <ArrowLeft size={12} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title="前进"
          aria-label="前进"
          disabled={!activeTab?.canGoForward}
          onClick={() => activeTab && void browserTabGoForward(surfaceId, activeTab.tabId)}
        >
          <ArrowRight size={12} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title="刷新"
          aria-label="刷新"
          disabled={!activeTab}
          onClick={() => activeTab && void reloadBrowserTab(surfaceId, activeTab.tabId)}
        >
          <RotateCw size={12} />
        </button>

        <input
          className={styles.address}
          value={addressDraft}
          placeholder="输入网址，回车打开"
          aria-label="地址栏"
          spellCheck={false}
          onChange={(event) => setAddressDraft(event.target.value)}
          onFocus={() => setAddressFocused(true)}
          onBlur={() => setAddressFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitAddress()
            }
          }}
        />

        <span
          className={styles.agentDot}
          data-active={surface?.agentControlled ?? false}
          title={surface?.agentControlled ? 'Agent 控制中' : 'Agent 未接管'}
        >
          Agent
        </span>

        {carrier === 'pane' && onRequestPopOut && (
          <button
            type="button"
            className={styles.iconBtn}
            title="弹出为独立窗口"
            aria-label="弹出为独立窗口"
            onClick={onRequestPopOut}
          >
            <ExternalLink size={12} />
          </button>
        )}
        {carrier === 'window' && onRequestEmbed && (
          <button
            type="button"
            className={styles.iconBtn}
            title="嵌入主窗口"
            aria-label="嵌入主窗口"
            onClick={onRequestEmbed}
          >
            <PanelRightOpen size={12} />
          </button>
        )}
      </div>

      <div ref={bodyRef} className={styles.body}>
        {isEmpty && (
          <div className={styles.empty}>
            <span>没有打开的标签页</span>
            <button type="button" onClick={() => void openBrowserTab(surfaceId)}>
              新建标签页
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
