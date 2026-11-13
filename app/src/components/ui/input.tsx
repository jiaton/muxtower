import type { ComponentProps, InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { focusRing, text } from './styles'

const field = `w-full rounded-md border border-border bg-surface px-3 text-base text-fg placeholder:text-fg-muted ${focusRing} disabled:opacity-50 sm:text-sm`

/** A field. `icon`: a quiet icon at its start (a search field's magnifier), the text starting after it. */
export function Input({ className, icon, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  const input = <input className={cn(field, 'h-10', icon && 'pl-8', className)} {...props} />
  if (!icon) return input
  return (
    <div className="relative">
      <span
        aria-hidden
        className={cn('pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 [&_svg]:size-4', text({ tone: 'muted' }))}
      >
        {icon}
      </span>
      {input}
    </div>
  )
}

/** A text area. `bare`: no box of its own, inside another that has it (the message box, a quote's reply). */
export function Textarea({ className, bare = false, ...props }: ComponentProps<'textarea'> & { bare?: boolean }) {
  return (
    <textarea
      className={cn(
        field,
        'min-h-10 resize-none py-2',
        bare && 'rounded-none border-0 bg-transparent focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  )
}
