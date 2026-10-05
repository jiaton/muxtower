import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'bg-surface-muted text-fg hover:bg-border',
  danger: 'bg-danger text-danger-fg hover:opacity-90',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
} as const

const SIZES = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', icon: 'size-9' } as const

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
