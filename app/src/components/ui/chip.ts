import { cva } from 'class-variance-authority'

/**
 * A chip: `filter`, a pill that narrows a list (the current one inverted, `data-current`); `choice`, one of
 * a few options to pick (the picked one in the accent, `aria-pressed`). On a Link or a plain Button.
 */
export const chip = cva('group inline-flex shrink-0 items-center gap-1.5 rounded-full border text-sm whitespace-nowrap transition-colors', {
  variants: {
    kind: {
      filter:
        'h-8 border-border bg-surface px-3 font-medium text-fg hover:bg-surface-muted data-[current=true]:border-fg data-[current=true]:bg-fg data-[current=true]:text-bg',
      choice:
        'border-border px-3 py-1 text-fg aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-fg disabled:opacity-40',
      /** Adds one more to the row: dashed, quiet. */
      add: 'h-8 border-dashed border-border px-2.5 text-fg-muted hover:bg-surface-muted hover:text-fg [&_svg]:size-4',
    },
  },
})

/** A filter chip's count: in its tone, quieter on the current chip. */
export const chipCount = cva('tabular-nums group-data-[current=true]:text-bg group-data-[current=true]:opacity-70', {
  variants: {
    tone: { muted: 'text-fg-muted', warning: 'text-state-permission', accent: 'text-accent' },
  },
  defaultVariants: { tone: 'muted' },
})
