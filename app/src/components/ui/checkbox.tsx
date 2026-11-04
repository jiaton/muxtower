import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/** A native checkbox in the accent color: one a label around it ticks too. */
export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input type="checkbox" className={cn('size-4 shrink-0 accent-accent disabled:opacity-50', className)} {...props} />
}
