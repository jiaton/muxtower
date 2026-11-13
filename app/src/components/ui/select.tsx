import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { focusRing } from './styles'

/** A native select, in the input's look: the phone's own picker on phones. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        `h-10 w-full rounded-md border border-border bg-surface px-3 text-base text-fg ${focusRing} disabled:opacity-50 sm:text-sm`,
        className,
      )}
      {...props}
    />
  )
}
