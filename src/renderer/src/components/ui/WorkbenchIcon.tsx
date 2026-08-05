import { BookOpen, Workflow } from 'lucide-react'

export type WorkbenchIconId = 'blueprint' | 'knowledge'

interface WorkbenchIconProps {
  id: WorkbenchIconId
  size?: number
  className?: string
}

export function WorkbenchIcon({ id, size = 16, className }: WorkbenchIconProps) {
  const Icon = id === 'blueprint' ? Workflow : BookOpen

  return <Icon className={className} size={size} strokeWidth={1.5} aria-hidden="true" />
}
