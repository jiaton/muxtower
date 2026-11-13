import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { focusRing } from './styles'

/** What every button has: focus, disabled, no text selection. */
const base = `select-none transition-colors ${focusRing} focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50`

const buttonVariants = cva(
  `inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap ${base} [&_svg]:size-4 [&_svg]:shrink-0`,
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
        secondary: 'bg-surface-muted text-fg hover:bg-border',
        outline: 'border border-border bg-surface text-fg hover:bg-surface-muted',
        danger: 'bg-danger text-danger-fg hover:bg-danger-hover',
        ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
        approve: 'bg-success text-success-fg hover:bg-success-hover',
        /** One of a set to pick from, a row of its own (`aria-checked` marks the picked ones). */
        option:
          'h-auto justify-start border border-border bg-surface px-3 py-2 text-left font-normal whitespace-normal text-fg hover:bg-surface-muted aria-checked:border-accent aria-checked:bg-surface-muted',
        /** Inline, in running text. */
        link: 'h-auto px-0 underline hover:text-accent',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
        icon: 'size-10',
        'icon-sm': 'size-8',
        'icon-xs': 'size-6 [&_svg]:size-3.5',
      },
      /** Over other content (a button floating at a view's edge). */
      floating: { true: 'shadow-card' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Omit<VariantProps<typeof buttonVariants>, 'variant'> {
  /** `plain`: no look of its own, for a button that wraps custom content whose look comes from other
   *  primitives (a row, a thumbnail, a chip): only focus and disabled. */
  variant?: VariantProps<typeof buttonVariants>['variant'] | 'plain'
  asChild?: boolean
}

export function Button({ className, variant, size, floating, asChild = false, type = 'button', ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  const look = variant === 'plain' ? base : buttonVariants({ variant, size, floating })
  return <Comp type={asChild ? undefined : type} className={cn(look, className)} {...props} />
}
