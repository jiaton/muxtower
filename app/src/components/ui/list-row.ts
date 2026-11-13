import { cva } from 'class-variance-authority'

/** A list's row (a session): its link, padded, grounded on hover and focus; quieter when out of reach. */
export const listRow = cva('flex gap-3 px-3 py-2.5 outline-none hover:bg-surface-muted focus-visible:bg-surface-muted sm:px-4')

/** What a row holds under its text (quick actions, side chats, forks): lined up with the text, past the
 *  row's state icon. */
export const listRowBelow = 'px-3 pb-3 pl-10 sm:px-4 sm:pl-11'

/** A tab of a small set (`role="tab"`): the selected one raised on its own ground. */
export const tab = cva(
  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-fg-muted aria-selected:bg-surface aria-selected:text-fg aria-selected:shadow-card [&_svg]:size-4',
)

/** A row of chips that scrolls sideways under a pane's header, reaching its edges (`outer` on the nav,
 *  `inner` on the scroller). */
export const bleedRow = { outer: '-mx-3 sm:-mx-4', inner: 'px-3 sm:px-4' } as const
