/**
 * Sessions opened from the list that have since left it: opening an unread one marks it read, and
 * answering one that needs you ends that. They stay at the end of the list, under "Just opened", until
 * it shows something else, so a slip of the finger is easy to see and undo.
 */
import type { SessionEntry } from './facets'
import type { Group, SessionQuery } from './query'

export const KEPT_GROUP = 'kept'

/** Of the sessions opened here (`opened`, entry keys, oldest first), those `visible` no longer shows.
 *  Hiding or showing one still takes it out of the list, as everywhere else. */
export function keptEntries(entries: SessionEntry[], visible: SessionEntry[], opened: string[], query: SessionQuery): SessionEntry[] {
  if (!opened.length) return []
  const shown = new Set(visible.map((e) => e.key))
  const byKey = new Map(entries.map((e) => [e.key, e]))
  return opened
    .map((key) => byKey.get(key))
    .filter((e): e is SessionEntry => e !== undefined && !shown.has(e.key) && Boolean(e.session.hidden) === (query.view === 'hidden'))
}

/** The last group of the list, when there is anything to keep: the most recently opened last, so a
 *  session sinks to the very bottom. */
export function keptGroups(kept: SessionEntry[]): Group[] {
  return kept.length ? [{ key: KEPT_GROUP, label: 'Just opened', entries: kept, implies: {} }] : []
}

