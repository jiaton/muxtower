import type { ComponentProps, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const field =
  'w-full rounded-md border border-border bg-surface px-3 text-base text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50 sm:text-sm'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, 'h-10', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(field, 'min-h-10 resize-none py-2', className)} {...props} />
}
