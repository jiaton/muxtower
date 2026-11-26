import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** A column of the app: a fixed header and a body that scrolls on its own. */
/** A pane of the layout; `ruled`: a rule along its side, against the pane beside it. */
export function Pane({ className, ruled = false, ...props }: ComponentProps<'section'> & { ruled?: boolean }) {
  return <section className={cn('flex min-h-0 min-w-0 flex-col bg-bg', ruled && 'border-r border-border', className)} {...props} />
}

/** The top bar of a pane: optional leading control (back), title with a subtitle, a live reading, trailing
 *  actions. The controls never give way: the title and the reading share what room is left. */
export function PaneHeader({
  leading,
  title,
  subtitle,
  actions,
  reading,
  children,
  className,
  component,
}: {
  /** The area's name for diagnostics (`data-component`: where a slow tap landed), a fixed phrase. */
  component?: string
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** A live figure before the actions (the plan-usage chip), in the room the controls and the title leave:
   *  an `@container` as wide as that, so what it holds says less as it narrows (its `@min-[…]:` variants),
   *  down to nothing, and the controls never move. */
  reading?: ReactNode
  /** Extra rows under the title row (search, filters). */
  children?: ReactNode
  className?: string
}) {
  return (
    <header
      data-component={component}
      className={cn('flex shrink-0 flex-col gap-2 border-b border-border bg-bg px-3 pt-2 pb-2 sm:px-4', className)}
    >
      <div className="flex min-h-10 items-center gap-1.5">
        {leading}
        {/* With a reading, the title keeps its own width first (truncating only past that) and the reading
            has the rest; without, the title has it all. */}
        <div className={reading ? 'min-w-0 shrink' : 'min-w-0 flex-1'}>
          <div className="flex min-w-0 items-center gap-2 text-base font-semibold">{title}</div>
          {subtitle ? <div className="truncate text-xs text-fg-muted">{subtitle}</div> : null}
        </div>
        {reading ? <div className="@container flex min-w-0 flex-1 justify-end">{reading}</div> : null}
        {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
      </div>
      {children}
    </header>
  )
}

/** The scrolling part of a pane. */
export function PaneBody({ className, ...props }: ComponentProps<'div'>) {
  // The last thing on the page (no tab bar under it): clear of a phone's home indicator.
  return <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]', className)} {...props} />
}
