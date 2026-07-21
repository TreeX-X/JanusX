import type { PaneDropEdge } from '@/lib/workspace-pane'

export type PaneDropHint = PaneDropEdge | 'center'

/*-- tab 条高度：该区域内的落点一律视为"合并到本 pane"，避免拖 tab 时误触顶部分屏 --*/
const TAB_STRIP_HEIGHT_PX = 36
/*-- 边缘分屏触发区：pane 尺寸的 28%，限制在 [56, 320]px --*/
const EDGE_ZONE_RATIO = 0.28
const EDGE_ZONE_MIN_PX = 56
const EDGE_ZONE_MAX_PX = 320

/*-- 落点分屏固定平分（VS Code 同款）；非平分布局由分隔条拖拽微调 --*/
export const SPLIT_RATIO_EQUAL = 0.5

/**
 * 落点判定：边缘区触发分屏，其余区域（含 tab 条）为合并。
 * 左/右优先于上/下，保证横向分屏容易触发。
 */
export function getPaneDropHint(element: HTMLElement, clientX: number, clientY: number): PaneDropHint {
  const rect = element.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top

  if (y <= TAB_STRIP_HEIGHT_PX) return 'center'

  const zoneX = Math.min(Math.max(rect.width * EDGE_ZONE_RATIO, EDGE_ZONE_MIN_PX), EDGE_ZONE_MAX_PX)
  const zoneY = Math.min(Math.max(rect.height * EDGE_ZONE_RATIO, EDGE_ZONE_MIN_PX), EDGE_ZONE_MAX_PX)

  if (x <= zoneX) return 'left'
  if (rect.width - x <= zoneX) return 'right'
  if (y <= zoneY) return 'top'
  if (rect.height - y <= zoneY) return 'bottom'
  return 'center'
}

export function paneDropHintLabel(hint: PaneDropHint): string {
  if (hint === 'left' || hint === 'right') return '左右分屏'
  if (hint === 'top' || hint === 'bottom') return '上下分屏'
  return '合并到此面板'
}
