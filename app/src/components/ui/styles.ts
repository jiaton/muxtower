import { cva } from 'class-variance-authority'

/**
 * The app's shared looks, each defined once here: text roles, surfaces and the focus ring. A feature composes
 * them (`cn(textRole.meta, 'mt-1')`) instead of writing their classes again: `scripts/check-tokens.mjs`
 * refuses those classes together anywhere outside components/ui.
 */
/**
 * Text: its size, tone and weight, and a few traits, as variants (`text({ size: 'sm', tone: 'muted' })`); on
 * a <Text> or on any element's className. The tones are the theme's: a session state's color goes through
 * `stateTone`.
 */
export const text = cva('', {
  variants: {
    size: { xs: 'text-xs', sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl' },
    tone: {
      fg: 'text-fg',
      muted: 'text-fg-muted',
      accent: 'text-accent',
      onAccent: 'text-accent-fg',
      inverse: 'text-bg',
      danger: 'text-danger',
      success: 'text-success',
      warning: 'text-state-permission',
      question: 'text-state-question',
      busy: 'text-state-busy',
      idle: 'text-state-idle',
      error: 'text-state-error',
    },
    weight: { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold' },
    mono: { true: 'font-mono' },
    /** Figures of the same width (counts, times). */
    numeric: { true: 'tabular-nums' },
    /** Letters spaced out: a code to read out or type. */
    spaced: { wide: 'tracking-wider', widest: 'tracking-widest' },
    italic: { true: 'italic' },
    underline: { true: 'underline' },
    /** Brighter on hover (a quiet control). */
    hoverFg: { true: 'hover:text-fg' },
  },
})

/** A session state's tone (StatusIcon, StateBadge, a state named in text). */
export const stateTone = {
  needs_permission: 'warning',
  needs_answer: 'question',
  needs_trust: 'warning',
  plan_review: 'question',
  error: 'error',
  busy: 'busy',
  idle: 'idle',
  unknown: 'muted',
} as const

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

/**
 * A box's look: its ground, its outline (or one edge), its corners, its ground on hover, its shadow, rules
 * between its children. Text on it is styled with `text`.
 */
export const box = cva('', {
  variants: {
    ground: {
      surface: 'bg-surface',
      muted: 'bg-surface-muted',
      accent: 'bg-accent',
      inverse: 'bg-fg',
      terminal: 'bg-terminal-bg',
      warning: 'bg-state-permission',
      transparent: 'bg-transparent',
    },
    outline: {
      default: 'border border-border',
      accent: 'border border-accent',
      warning: 'border border-state-permission',
      transparent: 'border border-transparent',
      none: 'border-0',
    },
    dashed: { true: 'border-dashed' },
    /** One edge only: a rule along a side. */
    edge: {
      top: 'border-t border-border',
      bottom: 'border-b border-border',
      left: 'border-l border-border',
      right: 'border-r border-border',
    },
    radius: { xs: 'rounded', sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full', none: 'rounded-none' },
    hover: { muted: 'hover:bg-surface-muted', faint: 'hover:bg-surface-muted/60', surface: 'hover:bg-surface' },
    shadow: { card: 'shadow-card', sm: 'shadow-sm' },
    /** Rules between its children (a list of rows). */
    divided: { true: 'divide-y divide-border' },
  },
})

/** The boxes features use most, by name. */
export const surface = {
  outlined: box({ outline: 'default', radius: 'md' }),
  muted: box({ outline: 'default', radius: 'md', ground: 'muted' }),
  list: box({ outline: 'default', radius: 'md', divided: true }),
} as const

/** Focus for any control: one outline, everywhere. */
export const focusRing = 'focus-visible:outline-2 focus-visible:outline-focus'
/** The same for a box that holds the focused control (a composer). */
export const focusWithinRing = 'focus-within:outline-2 focus-within:outline-focus'
