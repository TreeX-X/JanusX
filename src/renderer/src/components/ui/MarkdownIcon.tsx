// Note: this glyph is the drawer's Markdown view tab and the note pane's empty-state mark — see .agents/notes/implemented/feature/2026-09-21-drawer-markdown-file-glyph.md
// Conventional file glyph — page with a folded corner — carrying an M where a text file would carry its lines.
// NotebookPen's page plus four binding ticks plus a diagonal pen read as smudge at the drawer tab's 12px; the
// fold stays because it is what makes the shape read as a file, and the M alone carries the Markdown meaning.
export interface MarkdownIconProps {
  className?: string
  /** Mirrors lucide's own prop width so a LucideIcon and this glyph can share one record. */
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
      <path d="M7 18v-8l5 5L17 10v8" />
    </svg>
  )
}
