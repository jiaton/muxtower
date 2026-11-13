import type { HTMLAttributes, LabelHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { textRole } from './styles'

/** A field: its name over its control (and any hint under it), the whole of it the control's label. */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('flex flex-col gap-1.5 text-fg', textRole.label, className)} {...props} />
}

/** A quiet aside in a label's name ("optional", where a value came from). */
export function LabelNote({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(textRole.aside, className)} {...props} />
}
