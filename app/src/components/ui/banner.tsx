import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const bannerVariants = cva('flex items-start gap-2 rounded-md border px-3 py-2 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0', {
  variants: {
    tone: {
      info: 'border-border bg-surface-muted text-fg',
      warning: 'border-state-permission bg-state-permission-soft text-fg',
      error: 'border-state-error bg-state-error-soft text-fg',
    },
  },
  defaultVariants: { tone: 'info' },
})

export function Banner({ className, tone, ...props }: HTMLAttributes<HTMLDivElement> & VariantProps<typeof bannerVariants>) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={cn(bannerVariants({ tone }), className)} {...props} />
}
