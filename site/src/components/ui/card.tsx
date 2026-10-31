import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** A feature or a point: an icon, a title and a few lines. */
export function Card({ icon, title, children, className }: { icon?: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-lg border border-border bg-surface p-6', className)}>
      {icon && (
        <span aria-hidden className="flex size-9 items-center justify-center rounded-md bg-accent/10 text-accent [&_svg]:size-5">
          {icon}
        </span>
      )}
      <h3 className="font-semibold">{title}</h3>
      <div className="text-sm leading-relaxed text-fg-muted">{children}</div>
    </div>
  )
}
