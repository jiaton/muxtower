import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Slot } from 'radix-ui'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'bg-destructive text-danger-fg focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
        outline: 'border-border text-foreground [a&]:hover:bg-muted [a&]:hover:text-foreground',
        ghost: '[a&]:hover:bg-muted [a&]:hover:text-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline',
        /** The hero's line over its headline: on the page's ground, roomier. */
        eyebrow: 'border-border bg-background/80 px-3 py-1 font-mono font-normal text-foreground',
      },
      /** What it holds: a label (medium), plain words, or machine text. */
      text: { label: '', plain: 'font-normal', code: 'font-mono' },
    },
    defaultVariants: {
      variant: 'default',
      text: 'label',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  text,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'

  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant, text }), className)} {...props} />
}

export { Badge, badgeVariants }
