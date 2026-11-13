import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * A pane's bottom bar (the session footer): its rows stacked at the default gap, the bar's padding (`px-2
 * sm:px-3`, `py-2`, its bottom at least the safe area), the same left and right edge for every row.
 */
export function FooterBar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <footer
      className={cn(
        'flex shrink-0 flex-col gap-2 border-t border-border bg-bg px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The composer's columns, for a footer row that lines up with it: `lead` is the 40 px column of its first
 * button (the + of the message box), `gap` what follows it, and `inset` where the box's text starts inside
 * the box (its border and padding), so a row's text starts where a message's does; `trail` is the column of
 * its last button, for a row's own trailing action.
 */
export const composerColumns = {
  lead: 'flex w-10 shrink-0 items-center justify-center',
  /** The same column inside a row that has a border of its own (the Live row, an aligned banner). */
  leadInBox: 'flex w-10 shrink-0 items-center justify-center -ml-px',
  gap: 'gap-1.5',
  inset: 'pl-[13px]',
  /** The 40 px column of its last button (send): a row's trailing action (close, pause) centred in it. */
  trail: 'flex w-10 shrink-0 items-center justify-center -mr-px',
} as const
