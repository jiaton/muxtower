import { MAC } from './send-keys'

/**
 * Every keyboard shortcut of the app, in one place: the handlers read their keys from here (`matches`),
 * and the cheat sheet ("?"), the palette and the tooltips show them from here (`keysOf`, `withKeys`), so
 * what is said and what is done cannot drift apart.
 *
 * A chord is matched by the key's position (`code`), never its character, so a Mac's Option, which types a
 * character of its own (Option+I: "ˆ"), still gives the shortcut; and its modifiers exactly (Ctrl+Alt is
 * AltGr on Windows and never one of ours). `cmd` is ⌘ on a Mac and Ctrl elsewhere; `ctrl` is Ctrl
 * everywhere (a Mac's Control key too). A chord with `char` instead is a typed character (`?`, `/`, `[`),
 * where the character is the point, wherever a layout puts it.
 */
export interface Chord {
  /** `KeyboardEvent.code`, e.g. `KeyI`, `Enter`, `ArrowUp`. */
  code?: string
  /** A typed character (`KeyboardEvent.key`), e.g. `?`; Shift is then part of the character. */
  char?: string
  cmd?: boolean
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
}

export type ShortcutArea = 'global' | 'session' | 'composer' | 'list' | 'menu' | 'chipMenu' | 'live'

export const AREA_LABEL: Record<ShortcutArea, string> = {
  global: 'Anywhere',
  session: 'An open session',
  composer: 'The message box',
  list: 'The session list',
  menu: "A session's menu (open)",
  chipMenu: "A chip's menu (open)",
  live: 'Live',
}

export interface Shortcut {
  area: ShortcutArea
  /** What it does, as the cheat sheet says it. */
  label: string
  /** Its keys; more than one: any of them. */
  keys: Chord[]
}

/** The letters a session's menu picks its items by, while it is open (`DropdownMenuItem shortcut`). */
export const MENU_KEYS = {
  read: 'u', // unread / read
  pin: 'p',
  new: 'n',
  rename: 'r',
  place: 'm', // move
  team: 't',
  continue: 'c', // in a terminal
  hide: 'h',
  archive: 'a',
  interrupt: 's', // stop what it is doing
  delete: 'x', // and Delete
} as const

const MENU_LABEL: Record<keyof typeof MENU_KEYS, string> = {
  read: 'Mark read or unread',
  pin: 'Pin or unpin',
  new: 'New session here',
  rename: 'Rename',
  place: 'Move',
  team: 'Team',
  continue: 'Continue in terminal',
  hide: 'Hide or show',
  archive: 'Archive',
  interrupt: 'Interrupt',
  delete: 'Delete (or the Delete key)',
}

/** The keys a chip's menu (a right click or long press on a chip of the projects row) picks its items by,
 *  while it is open. Delete is the session menu's X (or the Delete key) here too. Its teams take 1 to 6. */
export const CHIP_MENU_KEYS = { edit: 'e', delete: 'x', moreTeams: 'm' } as const
export const CHIP_TEAM_KEYS = ['1', '2', '3', '4', '5', '6'] as const

const letter = (l: string): Chord => ({ code: `Key${l.toUpperCase()}` })

export const SHORTCUTS = {
  palette: { area: 'global', label: 'Go to a session or a command', keys: [{ code: 'KeyK', cmd: true }, { char: '/' }] },
  cheatSheet: { area: 'global', label: 'Keyboard shortcuts', keys: [{ char: '?' }] },
  layout: { area: 'global', label: 'Session only, or back', keys: [{ code: 'KeyF', alt: true }] },
  live: { area: 'global', label: 'Live on or off (resumes it when paused)', keys: [{ code: 'KeyL', alt: true }] },
  // Alt: it works in the message box too, where a bare N would be typed.
  quickAdd: { area: 'global', label: 'Add to the Inbox', keys: [{ code: 'KeyN', alt: true }] },
  interrupt: { area: 'session', label: 'Interrupt the agent, while it works', keys: [{ code: 'KeyI', alt: true }] },
  view: { area: 'session', label: 'Terminal or conversation', keys: [{ code: 'KeyV', alt: true }] },
  read: { area: 'session', label: 'Mark unread (back to the list) or read', keys: [{ code: 'KeyR', alt: true }] },
  send: { area: 'composer', label: 'Send', keys: [{ code: 'Enter' }] },
  newLine: { area: 'composer', label: 'New line', keys: [{ code: 'Enter', shift: true }] },
  suggestion: { area: 'composer', label: "Send the agent's suggestion (empty box)", keys: [{ code: 'Enter', cmd: true }] },
  clear: { area: 'composer', label: 'Clear the box', keys: [{ code: 'KeyU', ctrl: true }] },
  undo: { area: 'composer', label: 'Undo (a clear too)', keys: [{ code: 'KeyZ', cmd: true }] },
  older: { area: 'composer', label: 'Last message sent here, then older (empty box)', keys: [{ code: 'ArrowUp' }] },
  newer: { area: 'composer', label: 'Newer message; past the newest, empty', keys: [{ code: 'ArrowDown' }] },
  leaveHistory: { area: 'composer', label: 'Leave the sent messages', keys: [{ code: 'Escape' }] },
  mention: { area: 'composer', label: 'Mention a session', keys: [{ char: '@' }] },
  chipBack: { area: 'list', label: 'Previous chip', keys: [{ char: '[' }] },
  chipOn: { area: 'list', label: 'Next chip', keys: [{ char: ']' }] },
  ...(Object.fromEntries(
    Object.entries(MENU_KEYS).map(([id, l]) => [
      `menu-${id}`,
      { area: 'menu', label: MENU_LABEL[id as keyof typeof MENU_KEYS], keys: [letter(l)] },
    ]),
  ) as Record<`menu-${keyof typeof MENU_KEYS}`, Shortcut>),
  chipEdit: { area: 'chipMenu', label: 'Edit the group', keys: [letter(CHIP_MENU_KEYS.edit)] },
  chipDelete: { area: 'chipMenu', label: 'Delete the group (or the Delete key)', keys: [letter(CHIP_MENU_KEYS.delete)] },
  chipTeam: { area: 'chipMenu', label: "A project's team (in the menu's order)", keys: CHIP_TEAM_KEYS.map((d) => ({ char: d })) },
  chipMoreTeams: { area: 'chipMenu', label: 'More teams', keys: [letter(CHIP_MENU_KEYS.moreTeams)] },
  liveSend: { area: 'live', label: 'Send what is being said', keys: [{ code: 'Enter', cmd: true }] },
  liveCancel: { area: 'live', label: 'Let a waiting send go', keys: [{ code: 'Escape' }] },
} satisfies Record<string, Shortcut>

export type ShortcutId = keyof typeof SHORTCUTS

type Pressed = Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

/** Whether a key press is the chord: its key, and exactly its modifiers. */
export function chordMatches(chord: Chord, e: Pressed, mac = MAC): boolean {
  if (chord.char !== undefined) return e.key === chord.char && !e.ctrlKey && !e.metaKey && !e.altKey
  const command = mac ? e.metaKey : e.ctrlKey
  const wantCtrl = Boolean(chord.ctrl || (chord.cmd && !mac))
  const wantMeta = Boolean(chord.cmd && mac)
  if (chord.cmd && !command) return false
  return (
    e.code === chord.code &&
    e.ctrlKey === wantCtrl &&
    e.metaKey === wantMeta &&
    e.altKey === Boolean(chord.alt) &&
    e.shiftKey === Boolean(chord.shift)
  )
}

/** Whether a key press is one of the shortcut's chords. */
export const matches = (id: ShortcutId, e: Pressed, mac = MAC) => SHORTCUTS[id].keys.some((k) => chordMatches(k, e, mac))

const KEY_NAME: Record<string, string> = {
  Enter: '↵',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Slash: '/',
}

const keyName = (chord: Chord) => chord.char ?? KEY_NAME[chord.code ?? ''] ?? (chord.code ?? '').replace(/^Key|^Digit/, '')

/** A chord's keys, one cap each: ⌃ ⌥ ⇧ ⌘ on a Mac, Ctrl, Alt, Shift elsewhere. */
export function capsOf(chord: Chord, mac = MAC): string[] {
  const caps: string[] = []
  if (chord.ctrl) caps.push(mac ? '⌃' : 'Ctrl')
  if (chord.alt) caps.push(mac ? '⌥' : 'Alt')
  if (chord.shift) caps.push(mac ? '⇧' : 'Shift')
  if (chord.cmd) caps.push(mac ? '⌘' : 'Ctrl')
  caps.push(keyName(chord))
  return caps
}

/** A chord as text: "⌥I" on a Mac, "Alt+I" elsewhere. */
export const chordText = (chord: Chord, mac = MAC) => capsOf(chord, mac).join(mac ? '' : '+')

/** A shortcut's first chord as text (its main one). */
export const keysOf = (id: ShortcutId, mac = MAC) => chordText(SHORTCUTS[id].keys[0]!, mac)

/** A label with its shortcut, for a tooltip: "Interrupt (Alt+I)". */
export const withKeys = (label: string, id: ShortcutId, mac = MAC) => `${label} (${keysOf(id, mac)})`

/** The palette's form: caps joined by "+" (it draws one cap each). */
export const paletteKeys = (id: ShortcutId, mac = MAC) => capsOf(SHORTCUTS[id].keys[0]!, mac).join('+')

/** Whether a dialog (a Radix dialog, an alert, a sheet or drawer) or a menu is open: the app's own keys then
 *  leave the page alone. */
export const overlayOpen = () =>
  typeof document !== 'undefined' && document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null

/** Whether a key goes to a text field or to a box that takes keys itself (`data-own-keys`: the terminal). */
export function typedInto(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return true
  return Boolean(target.closest('[data-own-keys]'))
}
