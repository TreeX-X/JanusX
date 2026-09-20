// Note: this glyph is the drawer's Markdown view tab and the note pane's empty-state mark — see .agents/notes/implemented/feature/2026-09-21-drawer-markdown-file-glyph.md
// Conventional file glyph — page with a folded corner — carrying the markdown mark (M + down chevron) where a
// text file would carry its lines. NotebookPen's page plus four binding ticks plus a diagonal pen read as
// smudge at the drawer tab's 12px; the fold stays because it is what makes the shape read as a file.
export interface MarkdownIconProps {
  className?: string
  strokeWidth?: number | string
  'aria-hidden'?: boolean | 'true' | 'false'
}

export function MarkdownIcon({
  className,
  strokeWidth = 1.75,
  'aria-hidden': ariaHidden = true,
}: MarkdownIconProps) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M5 18v-7l3.5 3.5L12 11v7" />
      <path d="M16.5 11v6m-1.75-2.25 1.75 2.25 1.75-2.25" />
    </svg>
  )
}
