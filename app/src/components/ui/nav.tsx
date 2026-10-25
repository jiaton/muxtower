import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Classes for a navigation entry (sidebar link); TanStack Router marks the active one with
 *  `data-status="active"`. */
export const navItemClass = cn(
  'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg',
  'data-[status=active]:bg-surface-muted data-[status=active]:font-medium data-[status=active]:text-fg',
  '[&_svg]:size-4 [&_svg]:shrink-0',
)

/** The trailing count of a navigation entry; `alert` when some need attention. */
export function NavCount({ count, alert }: { count: number; alert?: boolean }) {
  if (!count) return null
  return (
    <span
      className={cn(
        'ml-auto min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums',
        alert ? 'bg-state-permission font-semibold text-bg' : 'text-fg-muted',
      )}
    >
      {count}
    </span>
  )
}

export function NavSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex h-7 items-center px-2.5 text-xs font-medium tracking-wide text-fg-muted uppercase">
        <span className="flex-1">{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Classes for a bottom tab bar entry (phones and tablets). */
export const tabItemClass = cn(
  'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs text-fg-muted',
  'data-[status=active]:font-medium data-[status=active]:text-accent [&_svg]:size-5',
)
