import { cva, type VariantProps } from 'class-variance-authority'
import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { composerColumns } from './bar'

const bannerVariants = cva('flex items-start rounded-md border py-2 text-sm [&_svg]:size-4 [&_svg]:shrink-0', {
  variants: {
    tone: {
      info: 'border-border bg-surface-muted text-fg',
      warning: 'border-state-permission bg-state-permission-soft text-fg',
      error: 'border-state-error bg-state-error-soft text-fg',
    },
    aligned: {
      false: 'gap-2 px-3 [&_svg]:mt-0.5',
      true: cn('pr-3', composerColumns.gap),
    },
  },
  defaultVariants: { tone: 'info', aligned: false },
})

const ICON = { info: Info, warning: TriangleAlert, error: CircleAlert } as const

/**
 * A notice. `aligned`: one of the rows over the message box (the session footer), lined up with it like
 * every row there: its tone's icon in the box's + column, its words where a message's start.
 */
export function Banner({
  className,
  tone,
  aligned,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof bannerVariants>) {
  const Icon = ICON[tone ?? 'info']
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn(bannerVariants({ tone, aligned }), className)} {...props}>
      {aligned ? (
        <>
          <span aria-hidden className={cn(composerColumns.lead, '-ml-px h-5')}>
            <Icon />
          </span>
          <div className={cn('flex min-w-0 flex-1 items-start gap-2', composerColumns.inset)}>{children}</div>
        </>
      ) : (
        children
      )}
    </div>
  )
}
