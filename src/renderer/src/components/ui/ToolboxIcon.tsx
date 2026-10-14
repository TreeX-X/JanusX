// 顶栏工具菜单的触发器图标——工具箱：一个控件装多件工具。
// 几何取自 lucide 的 toolbox 图标（lucide-static，ISC License，© lucide contributors），
// 按 0.468 尚无该图标、不为此升级依赖，故以自定义组件沿用其造型与描边风格。
export interface ToolboxIconProps {
  className?: string
  /** 与 lucide 同名 prop：允许与 LucideIcon 共用一份图标记录。 */
  strokeWidth?: number | string
  size?: number
  'aria-hidden'?: boolean | 'true' | 'false'
}

export function ToolboxIcon({
  className,
  strokeWidth = 1.5,
  size = 16,
  'aria-hidden': ariaHidden = true,
}: ToolboxIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
    >
      <path d="M16 12v4" />
      <path d="M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
      <path d="M17 6a2 2 0 011.414.586l3 3A2 2 0 0122 11v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8a2 2 0 01.586-1.414l3-3A2 2 0 017 6z" />
      <path d="M2 14h20" />
      <path d="M8 12v4" />
    </svg>
  )
}
