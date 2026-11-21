import { cn } from '../../lib/cn'
import { composerColumns } from './bar'
import { box, motion, surface, text, textRole } from './styles'

/**
 * What a feature says a piece of text or a box *is*; how that looks is decided here, once. Features import
 * `ink` and `look` (and components), never the builders in styles.ts (`scripts/check-styles.mjs`), and give
 * an element at most one of each (`ink.count` may join a text intent). Need another? Add it here, merging
 * rather than adding a near-duplicate.
 */

/** Text. */
export const ink = {
  /** Small and quiet: times, a line under a title, a hint under a field. */
  meta: textRole.meta,
  /** Body-size and quiet: a description, a secondary line. */
  hint: textRole.hint,
  /** Running text at the app's reading size. */
  body: text({ size: 'sm' }),
  /** Quieter than what is around it, at its size. */
  quiet: text({ tone: 'muted' }),
  /** Quiet, brighter when pointed at: a control drawn as text. */
  quietAction: text({ tone: 'muted', hoverFg: true }),
  /** What names a value or a control. */
  label: textRole.label,
  /** A name or a value that matters, among quieter text. */
  strong: text({ weight: 'medium', tone: 'fg' }),
  /** Stronger still: what is new (an unread session's name). */
  emphasis: text({ weight: 'semibold' }),
  /** Plain text again, inside a quieter run. */
  normal: text({ tone: 'fg' }),
  /** Marked: what is new, active or offered. */
  accent: text({ tone: 'accent' }),
  /** A title in the accent, at its weight (Live's state while it writes). */
  highlight: text({ tone: 'accent', weight: 'medium' }),
  /** A search's match in running text (a <mark>): a soft accent ground, the text's own colour, in both themes. */
  match: 'rounded-sm bg-accent-soft px-0.5 font-medium text-inherit',
  warning: text({ tone: 'warning' }),
  danger: text({ tone: 'danger' }),
  success: text({ tone: 'success' }),
  /** A small line about something that is not right: a warning, or a failure. */
  noteWarning: text({ size: 'xs', tone: 'warning' }),
  noteDanger: text({ size: 'xs', tone: 'danger' }),
  /** A small line about something new (an unread session's time). */
  noteAccent: text({ size: 'xs', tone: 'accent' }),
  /** Machine text: a path, a command, a version, at the size around it; `codeSmall` smaller. */
  code: text({ mono: true }),
  /** Machine text shown on its own at the reading size (a command to approve). */
  codeBody: text({ mono: true, size: 'sm' }),
  codeSmall: text({ mono: true, size: 'xs' }),
  /** Machine text in a quiet line under a title (an address). */
  codeMeta: text({ mono: true, size: 'xs', tone: 'muted' }),
  /** A code to read out or type (a pairing code). */
  readout: text({ mono: true, spaced: 'widest' }),
  /** Figures that line up (counts, times): the one trait that may join another text intent. */
  count: text({ numeric: true }),
  /** A section's small heading. */
  eyebrow: textRole.eyebrow,
  /** A quiet aside in a label ("optional"). */
  aside: textRole.aside,
  /** A link or an action in running text: in the accent, underlined. */
  link: cn(text({ tone: 'accent', underline: true }), 'underline-offset-2 hover:text-accent-hover'),
  /** A page's title (a single-purpose page such as pairing). */
  title: text({ size: 'xl', weight: 'semibold' }),
  /** The app's name. */
  brand: text({ mono: true, weight: 'semibold' }),
} as const

/** Boxes. */
export const look = {
  /** Set off from the page, quietly: a card inside a card, a placeholder, a tab strip's ground. */
  panel: surface.muted,
  /** Outlined, on the ground around it. */
  frame: surface.outlined,
  /** An outlined list of rows, ruled between them. */
  list: cn(surface.list, box({ ground: 'surface' })),
  /** Rules between rows, inside something that is already outlined. */
  rows: box({ divided: true }),
  /** A small rounded token (a scope, a word). */
  pill: box({ ground: 'muted', radius: 'full' }),
  /** A row that can be picked, grounded when pointed at. */
  hoverRow: box({ radius: 'md', hover: 'muted' }),
  /** The current one among its siblings. */
  selected: box({ ground: 'muted' }),
  /** A pane's ground. */
  surface: box({ ground: 'surface' }),
  /** A pane's edge bar: ground and the rule along that side. */
  bar: {
    top: box({ edge: 'top', ground: 'surface' }),
    bottom: box({ edge: 'bottom', ground: 'surface' }),
    side: box({ edge: 'right', ground: 'surface' }),
  },
  /** A rule along one side. */
  rule: {
    top: box({ edge: 'top' }),
    bottom: box({ edge: 'bottom' }),
    side: box({ edge: 'right' }),
    left: box({ edge: 'left' }),
  },
  /** A list's sticky group header: ruled below, the page's ground so rows pass under it. */
  listHeader: box({ edge: 'bottom', ground: 'page' }),
  /** A tool's output, quoted small. */
  output: `${box({ radius: 'sm', ground: 'muted' })} ${text({ mono: true, size: 'xs' })}`,
  /** A mockup an agent drew for an option (a question's preview): kept as drawn, monospace, lines that
   *  touch so box drawing joins, scrolled sideways rather than wrapped. */
  mockup: `${box({ radius: 'sm', ground: 'muted' })} ${text({ mono: true, size: 'xs' })} overflow-x-auto whitespace-pre leading-[1.2]`,
  /** A small label beside a name, quieter than it (the device a session runs on, in a project's group; a
   *  session header's role, project and machine): moderately rounded, never a pill. Not `pill`: a word
   *  set off in running text, round. */
  tag: `${box({ ground: 'muted', radius: 'md' })} ${text({ size: 'xs', tone: 'muted' })} px-1.5`,
  /** A table of counts, its cells ruled against each other (the team view's matrix, `matrixCell`). */
  matrix: 'w-full border-collapse text-center',
  /** A key on the keyboard, named where it does something (a menu item's shortcut). */
  keycap: `${box({ outline: 'default', radius: 'xs' })} ${text({ mono: true, size: 'xs', tone: 'muted' })} min-w-5 px-1 text-center`,
  /** Something waiting for an answer, in a conversation. */
  alertCard: `${box({ outline: 'warning', radius: 'md' })} ${text({ size: 'sm' })}`,
  /** The terminal's ground; `viewfinder` a camera's, rounded. */
  terminal: `${box({ ground: 'terminal' })} ${text({ tone: 'terminal' })}`,
  viewfinder: box({ ground: 'terminal', radius: 'md' }),
  /** A tile waiting for what it will show. */
  loadingTile: `${surface.muted} ${motion({ pulse: true })}`,
  /** The bar beside a quote. */
  quoteBar: box({ radius: 'full', ground: 'accent' }),
  /** A strip of small text over the terminal (loading older output). */
  terminalNote: `${box({ ground: 'terminal' })} ${text({ size: 'xs', tone: 'terminal' })}`,
  /** A card standing over the page (raised: outlined, its own ground, a shadow). */
  card: 'rounded-lg border border-border bg-surface shadow-card',
  /** Turns when it is rotated (an icon that becomes a close). */
  turning: motion({ turns: true }),
  /** A long rounded bar holding controls (recording). */
  capsule: box({ outline: 'default', radius: 'full', ground: 'surface' }),
} as const

/** A session's state mark, by its state (the status icon; the site's demo draws the same marks): `unread` a
 *  finished turn not yet looked at, `assistant` the concierge at rest. */
export const stateInk = {
  needs_permission: text({ tone: 'warning' }),
  needs_trust: text({ tone: 'warning' }),
  needs_answer: text({ tone: 'question' }),
  plan_review: text({ tone: 'question' }),
  error: text({ tone: 'error' }),
  busy: cn(text({ tone: 'busy' }), motion({ spin: 'slow' })),
  idle: text({ tone: 'idle' }),
  unknown: text({ tone: 'idle' }),
  unread: text({ tone: 'accent' }),
  assistant: text({ tone: 'accent' }),
} as const

/** A quote the message replies to: grounded while open, when pointed at otherwise. */
export const quoteCard = ({ open }: { open: boolean }) =>
  cn(box({ radius: 'lg', ground: open ? 'muted' : undefined, hover: open ? undefined : 'muted' }), text({ size: 'sm' }))

/** A list's row (a session): ruled below; on the accent's tint when it is the one shown (pointing at others
 *  grounds them grey, so the two never look alike); quieter when out of reach. */
export const listItem = ({ selected = false, dim = false }: { selected?: boolean; dim?: boolean }) =>
  cn(box({ edge: 'bottom' }), selected && box({ ground: 'accentSoft' }), dim && box({ faded: 'dim' }))

/** Where a list's row stands, its fork tree's indent and rails included: when it is the one shown, the
 *  accent's tint across all of it, and a bar in the accent down its outer left edge, outside the rails. */
export const listItemPlace = ({ selected = false }: { selected?: boolean }) =>
  cn('relative isolate scroll-mt-10', selected && box({ ground: 'accentSoft', marked: true })) // isolate: under sticky headers

/** A link in a tree under a row (a side chat): grounded when pointed at, and when it is the one shown. */
export const treeLink = ({ selected = false }: { selected?: boolean }) =>
  cn(box({ radius: 'end', hover: 'muted', ground: selected ? 'muted' : undefined }), text({ size: 'sm' }))

/** Live's status row: lined up with the message box, the same box in every state, its border shown only
 *  while paused. */
export const liveRow = ({ paused }: { paused: boolean }) =>
  cn(
    surface.outlined,
    'flex h-10 items-center',
    text({ size: 'sm', tone: 'muted' }),
    composerColumns.gap,
    paused ? box({ ground: 'muted' }) : box({ outline: 'transparent' }),
  )

/** A message in the conversation: one the owner sent, one on its way, one that did not go in. */
export const bubble = ({ state, focused = false }: { state: 'prompt' | 'pending' | 'undelivered'; focused?: boolean }) =>
  cn(
    'rounded-lg px-3 py-2 whitespace-pre-wrap',
    found(focused),
    state === 'undelivered'
      ? cn(box({ outline: 'default', dashed: true }), text({ tone: 'muted' }))
      : cn(box({ ground: 'accent', faded: state === 'pending' ? 'half' : undefined }), text({ tone: 'onAccent' })),
  )

/** A role in the team view (team-diagram.tsx): a card, outlined in the accent when it is the centre, in
 *  the busy colour while it works; quieter when it is outside the team (another project's). */
export const roleCard = ({ centre = false, busy = false, outside = false }: { centre?: boolean; busy?: boolean; outside?: boolean }) =>
  cn(
    'rounded-md border',
    centre ? 'border-accent' : busy ? 'border-state-busy' : 'border-border',
    box({ ground: 'surface' }),
    outside && box({ faded: 'dim' }),
  )

/** What is cut off at the bottom fades out (any ground: a mask, not a painted gradient): a clamped
 *  message (`Clamp`). */
export const fadeOut = '[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5em),transparent)]'

/** A chip being dragged into order (project-chips.tsx): the one in hand, lifted (a little larger, with a
 *  shadow), and where it came from, faint. */
export const lifted = 'cursor-grabbing rounded-full scale-105 shadow-card'
export const liftedFrom = 'opacity-30'

/** What Read aloud is saying, floating over the page (`ReadAloudCaption`): a card above the rest. */
export const caption = cn('rounded-lg border border-border bg-surface shadow-card', 'text-fg')
/** Its words: large enough to read at a glance, about four lines, then they scroll. */
export const captionText = 'max-h-[6.5em] overflow-y-auto text-lg leading-snug'

/** A conversation item a search led to: outlined in the accent for a moment (`ConversationView focus`). */
export const found = (on: boolean) =>
  cn('rounded-lg transition-shadow duration-700', on && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')

/** A cell of the team view's "who → whom" matrix (team-diagram.tsx): shaded in the accent by how much
 *  went that way (`level` 0–4), muted on the diagonal (a role to itself). */
export const matrixCell = ({ level, self = false }: { level: number; self?: boolean }) =>
  cn(
    'border border-border',
    self
      ? box({ ground: 'muted' })
      : ['', 'bg-accent/15 text-fg', 'bg-accent/30 text-fg', 'bg-accent/60 text-accent-fg', 'bg-accent text-accent-fg'][
          Math.max(0, Math.min(4, level))
        ],
  )

/** The team view's rail: the line the centre's partners hang from, and the stub to each. */
export const rail = { line: 'border-l-2 border-border', stub: 'border-t-2 border-border' } as const
