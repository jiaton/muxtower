/**
 * The app's shared looks, each defined once here: text roles, surfaces and the focus ring. A feature composes
 * them (`cn(textRole.meta, 'mt-1')`) instead of writing their classes again: `scripts/check-tokens.mjs`
 * refuses those classes together anywhere outside components/ui.
 */
export const textRole = {
  /** Small, quiet: times, counts, a line under a title. */
  meta: 'text-xs text-fg-muted',
  /** Body-size, quiet: a hint under a control, a secondary line. */
  hint: 'text-sm text-fg-muted',
  /** A section's small heading above what it names. */
  eyebrow: 'text-xs font-medium tracking-wide text-fg-muted uppercase',
  /** What names a value or a control. */
  label: 'text-sm font-medium',
  /** A quiet aside inside a label ("optional"). */
  aside: 'font-normal text-fg-muted',
} as const

/** A box set off from what is around it: outlined, outlined on the quieter ground, or a list of rows
 *  divided by rules. */
export const surface = {
  outlined: 'rounded-md border border-border',
  muted: 'rounded-md border border-border bg-surface-muted',
  list: 'divide-y divide-border rounded-md border border-border',
} as const

/** Focus for any control: one outline, everywhere. */
export const focusRing = 'focus-visible:outline-2 focus-visible:outline-focus'
/** The same for a box that holds the focused control (a composer). */
export const focusWithinRing = 'focus-within:outline-2 focus-within:outline-focus'
