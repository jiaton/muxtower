import { cva, type VariantProps } from 'class-variance-authority'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './indicators'
import { textRole } from './styles'

/** How long a load may take before it shows: a quick one never flashes a placeholder. */
export const SHOW_AFTER_MS = 150

// Inline, in the middle of the line it stands for, so a line of text keeps its height. On the rule's
// colour, a step above the muted ground: that one is barely apart from the page (about 1.09:1 in light),
// this one is about 1.3:1 in light and dark.
const shape = cva('inline-block bg-border align-middle motion-safe:animate-pulse', {
  variants: {
    shape: {
      /** A line of small text; `title` one of a heading (as tall as its line: no jump when it comes). */
      line: 'h-3 rounded-sm',
      title: 'my-1 h-4 rounded-sm',
      /** A state badge. */
      badge: 'h-5 w-16 rounded-full',
      /** A count not known yet (beside a chip's or a header's label). */
      count: 'h-3 w-4 rounded-sm',
      /** A row's status icon. */
      icon: 'size-4 shrink-0 rounded-full',
      /** A control (a button, the message box). */
      control: 'h-10 rounded-md',
      /** An area that fills what it is given. */
      block: 'rounded-md',
    },
  },
  defaultVariants: { shape: 'line' },
})

/** A placeholder in the shape of what is coming: muted, pulsing (still for readers who ask for less
 *  motion). Its width and place are the caller's (layout classes). */
export function Skeleton({ shape: kind, className }: VariantProps<typeof shape> & { className?: string }) {
  return <span aria-hidden className={cn(shape({ shape: kind }), className)} />
}

/** Whether SHOW_AFTER_MS has passed since it mounted. */
export function useShownAfter(ms = SHOW_AFTER_MS) {
  const [shown, setShown] = useState(ms <= 0)
  useEffect(() => {
    if (shown) return
    const timer = setTimeout(() => setShown(true), ms)
    return () => clearTimeout(timer)
  }, [ms, shown])
  return shown
}

/** What a load shows, after SHOW_AFTER_MS: `children` (a skeleton), else one quiet line. Announced to
 *  screen readers as loading at once. */
export function Loading({ children, label = 'Loading…' }: { children?: ReactNode; label?: string }) {
  const shown = useShownAfter()
  return (
    <div role="status" aria-live="polite" aria-busy className="contents">
      <span className="sr-only">{label}</span>
      {shown
        ? (children ?? (
            <p aria-hidden className={`${textRole.hint} flex items-center gap-2 py-2`}>
              <Spinner /> {label}
            </p>
          ))
        : null}
    </div>
  )
}
