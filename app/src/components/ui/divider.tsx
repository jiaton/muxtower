import { cn } from '@/lib/cn'

/** A thin rule between groups of things: across a column, or (`vertical`) between items of a row. */
export function Divider({ vertical = false, className }: { vertical?: boolean; className?: string }) {
  return <span aria-hidden className={cn('shrink-0 bg-border', vertical ? 'my-1.5 w-px self-stretch' : 'h-px w-full', className)} />
}
