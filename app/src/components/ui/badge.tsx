import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-surface-muted text-fg-muted',
      permission: 'bg-state-permission-soft text-state-permission',
      question: 'bg-state-question-soft text-state-question',
      error: 'bg-state-error-soft text-state-error',
      busy: 'bg-state-busy-soft text-state-busy',
      idle: 'bg-surface-muted text-fg-muted',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
