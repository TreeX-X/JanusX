import { SquareTerminal } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { TerminalPreset } from '@/types'
import claudeIcon from '@/assets/icons/claude.svg'
import codexIcon from '@/assets/icons/codex.svg'
import opencodeIcon from '@/assets/icons/opencode.svg'
import janusIcon from '@/assets/icons/janus.svg'
import piIcon from '@/assets/icons/pi.svg'

// Note: shell 字形改走 currentColor 线性图标，shell 之外的 preset 保持品牌静态资源 —— see
// .agents/notes/2026-09-30-terminal-preset-icon-shell-currentcolor--0b4c1f77.md

/**
 * 品牌字形自带颜色（claude 橙 / opencode 灰白 / janus 灰橙 / pi 黑白底），两套主题都可读，
 * 继续当静态资源用。
 */
const BRAND_ICON_SOURCES: Partial<Record<TerminalPreset, string>> = {
  claude: claudeIcon,
  codex: codexIcon,
  opencode: opencodeIcon,
  janus: janusIcon,
  pi: piIcon,
}

export interface TerminalPresetIconProps {
  preset: TerminalPreset
  /** 尺寸由 className / style 决定（沿用各调用点原有的 h-3.5 w-3.5 等写法）。 */
  className?: string
  style?: CSSProperties
  /** 需要给读屏用户的名称；省略即视为装饰性图标。 */
  alt?: string
}

/**
 * 终端 preset 图标，全局唯一入口：侧栏终端行、中部 tab、底部抽屉（条 / 其他会话胶囊 /
 * 运行态卡片）、新建终端浮层、空态选择器、会话面板、蓝图节点详情的 preset 选择栏都走
 * 这里，改一次形状/色值即全站生效。
 *
 * shell 曾经用 terminal.svg，描边写死 `#d4d4d4`：深色主题下正常，纸面主题的米色底
 * （#EFE4C5）上等于消失，用户只看得见名称。改用 lucide 的 currentColor 线性字形后，
 * 颜色继承所在文字色 —— 深色拿到浅描边、纸面拿到墨色描边，且与中部 tab 原本就在用的
 * 那一枚 shell 图标收敛成同一形状。
 */
export function TerminalPresetIcon({ preset, className, style, alt }: TerminalPresetIconProps) {
  if (preset === 'shell') {
    return (
      <SquareTerminal
        strokeWidth={1.75}
        role={alt ? 'img' : undefined}
        aria-label={alt}
        aria-hidden={alt ? undefined : true}
        className={className}
        style={style}
      />
    )
  }
  const src = BRAND_ICON_SOURCES[preset]
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt ?? ''}
      aria-hidden={alt ? undefined : 'true'}
      className={className}
      style={style}
    />
  )
}
