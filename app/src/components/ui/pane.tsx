import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** A column of the app: a fixed header and a body that scrolls on its own. */
/** A pane of the layout; `ruled`: a rule along its side, against the pane beside it. */
export function Pane({ className, ruled = false, ...props }: ComponentProps<'section'> & { ruled?: boolean }) {
  return <section className={cn('flex min-h-0 min-w-0 flex-col bg-bg', ruled && 'border-r border-border', className)} {...props} />
}

/** The top bar of a pane: optional leading control (back), title with a subtitle, trailing actions. */
export function PaneHeader({
  leading,
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Extra rows under the title row (search, filters). */
  children?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex shrink-0 flex-col gap-2 border-b border-border bg-bg px-3 pt-2 pb-2 sm:px-4', className)}>
      <div className="flex min-h-10 items-center gap-1.5">
        {leading}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 text-base font-semibold">{title}</div>
          {subtitle ? <div className="truncate text-xs text-fg-muted">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
      </div>
      {children}
    </header>
  )
}

/** The scrolling part of a pane. */
export function PaneBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)} {...props} />
}
