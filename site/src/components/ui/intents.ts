import { cn } from 'cn'
import { listItem } from '@app/components/ui/intents'

/**
 * What a section or the demo says a piece of text or a box *is*; how that looks is decided here, once, with
 * the site's marketing tokens (site.css). Sections import `ink` and `look`; the demo draws the app with the
 * app's own intents (`@app/components/ui/intents`) and its device chrome with `device`. An element takes at
 * most one of each (`ink.count` may join); a new intent says which existing one it is not, and why.
 */

/** Text. */
export const ink = {
  /** The hero's headline (its size is the site's own token). */
  hero: 'text-hero font-semibold',
  /** The hero's lead: larger than a section's (`lead`), growing on wide screens. */
  heroLead: 'text-lg leading-relaxed text-muted-foreground sm:text-xl',
  /** A section's or the closing call's headline. */
  display: 'text-4xl font-semibold tracking-tighter sm:text-5xl',
  /** A paragraph of marketing copy: quiet, in a relaxed rhythm. Not `note`: that is one line. */
  copy: 'text-sm leading-relaxed text-muted-foreground',
  /** Text at the reading size of a card's preview. */
  body: 'text-sm',
  /** A one-line caption, note or row of links under something. Not `copy`: no paragraph rhythm. */
  note: 'text-sm text-muted-foreground',
  /** Small, at the colour around it (the drawn app's last line under a session). */
  small: 'text-xs',
  /** Quieter than what is around it, at its size. */
  quiet: 'text-muted-foreground',
  /** Small and quiet (a time, a sub-label). */
  meta: 'text-xs text-muted-foreground',
  /** A title among quieter text (a card's, a list item's). */
  strong: 'font-medium',
  /** A card's heading. Not `strong`: a heading, not a name in a line. */
  heading: 'font-semibold',
  /** A small heading over a table or a panel. */
  label: 'text-sm font-medium',
  /** The brand's colour: icons and words that carry it. */
  accent: 'text-primary',
  success: 'text-success',
  warning: 'text-state-permission',
  /** Plain foreground again inside quieter text (an icon). */
  normal: 'text-foreground',
  /** Machine text (a command, a version, a project name). */
  code: 'font-mono',
  /** Machine text, small and quiet (who handed work to whom). */
  codeMeta: 'font-mono text-xs text-muted-foreground',
  /** A small machine label under a diagram's node. Not `codeMeta`: full colour, tight lines. */
  nodeLabel: 'font-mono text-xs leading-tight',
  /** A small line in the success colour (the phone's link on the hub map). */
  successNote: 'text-xs text-success',
  /** A machine's name on its tile (the demo's strip). */
  nodeName: 'text-xs font-medium',
  /** A preview's machine text (a hub's update list). */
  codeSmall: 'font-mono text-xs',
  /** The app's name. */
  brand: 'font-mono text-sm font-semibold text-foreground',
  /** A quiet link in a row of links (header, footer), the foreground on hover. */
  navLink: 'transition-colors hover:text-foreground',
  /** Figures that line up. */
  count: 'tabular-nums',
  /** A big figure on the dark band. */
  figure: 'font-mono text-3xl font-semibold tracking-tight text-ink-fg tabular-nums sm:text-4xl',
  /** Copy on the dark band. Not `copy`: the band's own quiet tone. */
  inkCopy: 'text-sm leading-relaxed text-ink-muted',
  /** The demo's caption over the stage: what this moment shows. */
  caption: 'text-lg leading-snug sm:text-xl',
} as const

/** Boxes. */
export const look = {
  /** The page: its ground and text. */
  page: 'bg-background text-foreground',
  /** The sticky header: translucent over what scrolls under it. */
  headerBar: 'border-b border-border/60 bg-background/70 backdrop-blur-xl',
  /** A large stage set off from the page (the closing call). */
  showcase: 'rounded-2xl border border-border bg-card shadow-card-soft',
  /** The same, translucent over the hero's glow (the demo's stage). */
  showcaseGlass: 'rounded-2xl border border-border bg-card/70 shadow-card-soft backdrop-blur',
  /** The hero's glow behind it. */
  glow: 'bg-glow blur-3xl',
  /** A card set off from the page (a preview's notification). */
  card: 'rounded-xl border border-border bg-card shadow-card-soft',
  /** An app's icon, its corners rounded. */
  appIcon: 'rounded-md',
  /** A small square holding an icon. */
  iconTile: 'rounded-lg border border-border bg-card',
  /** A feature cell's preview area, ruled from its text. */
  previewStage: 'border-b border-border bg-background',
  /** A list's bullet in the brand colour; `liveDot` the green "running" dot. */
  bullet: 'rounded-full bg-primary',
  liveDot: 'rounded-full bg-success',
  /** A rule beside a figure on the dark band. */
  inkRule: 'border-l border-ink-border',
  /** A card on the dark band. */
  inkCard: 'rounded-xl border border-ink-border bg-card text-card-foreground',
  /** A warning line in a preview. */
  alert: 'rounded-md bg-state-permission-soft text-sm',
  /** A terminal's output in a preview. */
  terminalBlock: 'rounded-lg bg-terminal-bg font-mono text-xs leading-relaxed text-terminal-fg',
  /** A preview card marking the newest (the hub's version). */
  highlightCard: 'rounded-lg border border-primary/40 bg-card',
  /** A chat preview's lines: what the owner asked, what came back. */
  askBubble: 'rounded-xl bg-primary text-sm text-primary-foreground',
  answerBubble: 'rounded-xl bg-muted text-sm',
  /** A quote inside an asked line. */
  bubbleQuote: 'border-l-2 border-primary-foreground/50 text-xs opacity-80',
} as const

/** A hand-off between teammates: the owner's own on the brand colour, an agent's on the muted ground. Not
 *  `askBubble`/`answerBubble`: a running line of copy, in the relaxed rhythm. */
export const handoff = ({ mine }: { mine: boolean }) =>
  cn('rounded-xl px-3.5 py-2 text-sm leading-relaxed', mine ? 'bg-primary text-primary-foreground' : 'bg-muted')

/** A node of the hub diagram: round, on a card; the hub ringed in the brand colour. */
export const beamNode = ({ hub }: { hub: boolean }) =>
  cn('rounded-full border bg-card shadow-card-soft', hub ? 'border-primary/40' : 'border-border')

/** The demo's device chrome and its storytelling marks. The app inside the devices is drawn with the app's own
 *  intents (`@app/components/ui/intents`), so it cannot drift from the app; these are what the app has no
 *  intent for: the devices, the pointer and spotlight, the hub map, and the demo's own simplified rows. */
export const device = {
  /** A phone: its frame, its screen, the status bar, the notch. */
  phone: 'rounded-device bg-device-frame shadow-device',
  screen: 'rounded-screen bg-background',
  statusBar: 'text-xs font-semibold',
  notch: 'rounded-full bg-device-frame',
  /** The lock screen's clock and a notification on it. */
  lockClock: 'text-6xl font-light tracking-tight',
  notification: 'rounded-lg bg-muted',
  /** A phone app's title bar heading. */
  appTitle: 'text-lg font-semibold',
  /** The open session's name over its conversation on the phone. */
  sessionTitle: 'text-sm font-semibold',
  /** A menu over the screen. */
  popover: 'rounded-md border border-border bg-popover shadow-card',
  /** A drawn message box, its quoted line, and its caret. */
  inputBox: 'rounded-lg border border-border text-sm',
  quoteChip: 'rounded-md bg-muted text-xs',
  caret: 'animate-pulse bg-fg',
  /** A desktop window: the window, its title bar, the traffic lights, the address bar. */
  window: 'rounded-xl bg-background shadow-window',
  titleBar: 'border-b border-border bg-muted',
  trafficLight: 'rounded-full bg-border',
  addressBar: 'rounded-md bg-background font-mono text-xs text-fg-muted',
  /** The window's sidebar, its views (the first one current) and its machines. */
  sidebar: 'border-r border-border bg-surface text-sm',
  sidebarView: 'rounded-md first:bg-muted',
  sidebarItem: 'rounded-md',
  /** A drawn list's group header: the machine's name, quiet and small on the muted ground. */
  groupHeader: 'bg-muted text-xs font-medium text-fg-muted',
  /** The pointer: its glow, its shadow, its arrow. */
  cursorGlow: 'rounded-full bg-glow',
  cursorShadow: 'drop-shadow-lg',
  cursorArrow: 'fill-cursor stroke-cursor-edge',
  /** What the story points at: a ring, and its label. */
  spotlight: 'rounded-lg shadow-spotlight ring-2 ring-primary',
  spotlightLabel: 'rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-card',
  /** The hub map's veil over the window, its lines (to the hub, from the phone). */
  mapScrim: 'rounded-xl bg-scrim backdrop-blur-sm',
  lineOut: 'stroke-accent',
  lineBack: 'stroke-success',
  /** A drawn approval: its card and the command waiting in it. */
  approval: 'border-b border-border bg-state-permission-soft',
  command: 'rounded-sm bg-background font-mono text-xs',
  /** A notice strip in the drawn app (the hub is down); `noticeRuled` ruled from what is under it. */
  notice: 'bg-state-permission-soft text-xs',
  noticeRuled: 'border-b border-border bg-state-permission-soft text-xs',
  /** A quote in a sent message. */
  sentQuote: 'border-l-2 border-primary-foreground/60 opacity-85',
  /** Words picked out in a reply (what gets quoted). */
  picked: 'rounded-sm bg-state-busy-soft text-fg',
  /** An agent's reply text. */
  reply: 'text-sm leading-relaxed',
} as const

/** A machine of the demo's strip: the hub outlined in the accent, all tinted when the story points at them,
 *  the hub faded while it is down. */
export const machineTile = ({ hub, flash, off }: { hub: boolean; flash: boolean; off: boolean }) =>
  cn(
    'rounded-lg border bg-card transition-colors duration-700',
    hub ? 'border-accent' : 'border-border',
    flash && 'bg-state-busy-soft',
    off && 'opacity-40',
  )

/** A machine's group in a drawn list, faded while it cannot be reached. */
export const deviceGroup = ({ off }: { off: boolean }) => cn('transition-opacity', off && 'opacity-40')

/** A node of the hub map: the hub outlined and glowing. */
export const mapNode = ({ hub }: { hub: boolean }) =>
  cn('rounded-lg border bg-card text-sm', hub ? 'border-accent shadow-glow' : 'border-border')

/** A tool call in the drawn conversation, or a task a teammate sent (tinted in the accent). */
export const toolRow = ({ task }: { task: boolean }) =>
  cn('rounded-md border', task ? 'border-accent bg-state-busy-soft' : 'border-border bg-muted')

/** A session row in the drawn list: the app's row (`listItem`), and a flash when something lands. */
export const demoRow = ({ selected, flash }: { selected: boolean; flash: boolean }) =>
  cn(listItem({ selected }), 'transition-colors duration-500', flash && 'bg-state-busy-soft')

/** A side chat's line under its session: ruled as a row, small and quiet; a flash when it lands. */
export const demoSideRow = ({ flash }: { flash: boolean }) =>
  cn(listItem({}), 'text-xs text-fg-muted transition-colors duration-500', flash && 'bg-state-busy-soft')

/** A drawn session's name: semibold while unread. */
export const demoRowTitle = ({ unread }: { unread: boolean }) => cn('text-sm', unread ? 'font-semibold' : 'font-medium')
