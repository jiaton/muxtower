import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { cn } from '@/lib/cn'
import { focusRing } from './styles'

/**
 * A live reading in a header that can grow, like a phone's Dynamic Island, into a pill over the page when it
 * matters, and settle back. One element in two shapes:
 * - `chip`: small, in a header; its tone tints it (the figures inside and their tones are the feature's);
 * - `float`: a dark pill dropped below the header, centred over the page; it resizes nothing.
 * `name` pairs the two for `morph` (a view transition's name: one element at a time has it).
 * Not `Badge`: a badge labels something; this is a reading that changes and can be tapped.
 */
const island = cva(`flex min-w-0 items-center text-left tabular-nums ${focusRing} focus-visible:outline-offset-2`, {
  variants: {
    shape: {
      chip: 'gap-1.5 rounded-2xl border px-2 py-1 text-xs whitespace-nowrap',
      float:
        'fixed top-[calc(env(safe-area-inset-top)+4.25rem)] left-1/2 z-[80] w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 gap-3 rounded-full border border-border bg-terminal-bg py-1.5 pr-5 pl-1.5 text-sm text-terminal-fg shadow-card',
    },
    tone: { normal: '', warning: '', danger: '' },
  },
  compoundVariants: [
    { shape: 'chip', tone: 'normal', className: 'border-border bg-surface text-fg' },
    { shape: 'chip', tone: 'warning', className: 'border-state-permission bg-state-permission-soft text-fg' },
    { shape: 'chip', tone: 'danger', className: 'border-state-error bg-state-error-soft text-fg' },
  ],
})

export type IslandShape = 'chip' | 'float'
export type IslandTone = 'normal' | 'warning' | 'danger'

export function Island({
  shape,
  tone = 'normal',
  name,
  lead,
  title,
  detail,
  onPress,
  label,
  className,
}: {
  shape: IslandShape
  tone?: IslandTone
  name?: string
  /** Before the text: a ring, an icon. */
  lead?: ReactNode
  /** What it says (in a chip, all of it). */
  title: ReactNode
  /** A quieter line under the title. */
  detail?: ReactNode
  /** Tapping it. Without, it is not a control of its own (a chip inside a popover's trigger). */
  onPress?: () => void
  /** Its name for assistive technology, when the text alone does not say it. */
  label?: string
  className?: string
}) {
  const body = (
    <>
      {lead}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('min-w-0 truncate', shape === 'float' && 'font-medium')}>{title}</span>
        {detail ? <span className="min-w-0 truncate text-xs text-terminal-fg/70">{detail}</span> : null}
      </span>
    </>
  )
  const style = name ? { viewTransitionName: name } : undefined
  const classes = cn(island({ shape, tone }), className)
  return onPress ? (
    <button type="button" className={classes} style={style} onClick={onPress} aria-label={label}>
      {body}
    </button>
  ) : (
    <div className={classes} style={style} role={shape === 'float' ? 'status' : undefined} aria-label={label}>
      {body}
    </div>
  )
}

/** Whether the page should keep still (`prefers-reduced-motion`); false where nothing answers media queries. */
export function prefersStill() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Changes an island's shape (`update`, a state change) as one movement: the browser's view transition
 *  morphs the element named alike from its old box to its new one (`tokens.css` times it like a spring).
 *  Without View Transitions (Safari before 18), or under reduced motion, the change just happens, at once. */
export function morph(update: () => void) {
  if (typeof document.startViewTransition !== 'function' || prefersStill()) return update()
  document.startViewTransition(() => flushSync(update))
}
