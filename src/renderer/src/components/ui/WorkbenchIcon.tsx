import { BookOpen } from 'lucide-react'

export type WorkbenchIconId = 'blueprint' | 'knowledge'

interface WorkbenchIconProps {
  id: WorkbenchIconId
  size?: number
  className?: string
}

export function WorkbenchIcon({ id, size = 16, className }: WorkbenchIconProps) {
  if (id === 'blueprint') {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="9.5" y="2.5" width="5" height="4" rx="1" />
        <rect x="3" y="17.5" width="5" height="4" rx="1" />
        <rect x="16" y="17.5" width="5" height="4" rx="1" />
        <path d="M12 6.5 V11 H5.5 V17.5 M12 11 H18.5 V17.5" />
      </svg>
    )
  }

  return <BookOpen className={className} size={size} strokeWidth={1.5} aria-hidden="true" />
}