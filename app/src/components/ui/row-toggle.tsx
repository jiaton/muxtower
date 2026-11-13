import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './button'
import { Chevron } from './indicators'
import { text, textRole } from './styles'

/**
 * The quiet line under a list row that folds what the row holds (its side chats, its forks): an icon, how
 * many, how many are unread while folded, a chevron. Tucked up under the row's text. Without `onToggle` it
 * cannot be folded (something in there needs you).
 */
export function RowToggle({
  icon,
  label,
  unread,
  open,
  onToggle,
}: {
  icon: ReactNode
  label: string
  unread?: number
  open: boolean
  onToggle?: () => void
}) {
  return (
    <Button
      variant="plain"
      aria-expanded={open}
      onClick={onToggle}
      disabled={!onToggle}
      className={cn(textRole.meta, '-mt-1.5 flex items-center gap-1.5 py-1 enabled:hover:text-fg [&_svg]:size-3.5')}
    >
      {icon}
      {label}
      {!open && unread ? <span className={text({ weight: 'medium', tone: 'accent' })}>· {unread} unread</span> : null}
      <Chevron open={open} />
    </Button>
  )
}
