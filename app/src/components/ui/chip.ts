import { cva } from 'class-variance-authority'

/**
 * A chip: `filter`, a pill that narrows a list (the current one inverted, `aria-current`); `choice`, one of
 * a few options to pick (the picked one in the accent, `aria-pressed`). On a Link or a plain Button.
 */
export const chip = cva('group inline-flex shrink-0 items-center gap-1.5 rounded-full border text-sm whitespace-nowrap transition-colors', {
  variants: {
    kind: {
      filter:
        'h-8 border-border bg-surface px-3 font-medium text-fg hover:bg-surface-muted aria-[current=true]:border-fg aria-[current=true]:bg-fg aria-[current=true]:text-bg',
      choice:
        'border-border px-3 py-1 text-fg aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-fg disabled:opacity-40',
    },
  },
})

/** A filter chip's count: in its tone, quieter on the current chip. */
export const chipCount = cva('tabular-nums group-aria-[current=true]:text-bg group-aria-[current=true]:opacity-70', {
  variants: {
    tone: { muted: 'text-fg-muted', warning: 'text-state-permission', accent: 'text-accent' },
  },
  defaultVariants: { tone: 'muted' },
})
