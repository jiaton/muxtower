/**
 * Switching the second chip row's chip without a click (a sideways wheel over the list, `[` and `]`), and
 * where a switch lands beside the list: the session last opened under that chip, else its first.
 */
import { isAssistant, type SessionEntry } from './facets'
import { foldForks } from './forks'
import { filterEntries, groupEntries, type SessionQuery } from './query'
import { foldSideChats } from './side-chats'

/** No chip ("All"), as `stepChip` and the memory name it. */
export const NO_CHIP = ''

/**
 * The chip one step back or on from `current` in the row's order, no chip coming first; null past either
 * end (no wrapping). A chip the row does not show (`current` unknown) counts as no chip.
 */
export function stepChip(ids: readonly string[], current: string | undefined, by: -1 | 1): string | null {
  const cycle = [NO_CHIP, ...ids]
  const at = Math.max(0, cycle.indexOf(current ?? NO_CHIP))
  const next = at + by
  return next < 0 || next >= cycle.length ? null : cycle[next]!
}

/** A session, by its daemon and its id (as the route names it). */
export interface SessionRef {
  daemonId: string
  sessionId: string
}

/** The sessions the list shows first-level for `query`, in its order (pinned, groups, sections); assistants
 *  and the side chats and forks held under a row left out. */
export function listOrder(entries: SessionEntry[], query: SessionQuery, projectOrder: readonly string[] = []): SessionEntry[] {
  const { shown: unfolded } = foldSideChats(filterEntries(entries, query))
  const { shown } = foldForks(unfolded)
  return groupEntries(shown, query.group, projectOrder)
    .flatMap((g) => g.entries)
    .filter((e) => !isAssistant(e.session))
}

/**
 * Where switching to a chip lands (its `query`): the session `remembered` for it while it is still in the
 * list there and not archived, else the list's first session there, else none (the empty pane).
 */
export function chipLanding(
  entries: SessionEntry[],
  query: SessionQuery,
  remembered: SessionRef | undefined,
  projectOrder: readonly string[] = [],
): SessionEntry | null {
  const listed = listOrder(entries, query, projectOrder)
  const kept =
    remembered &&
    listed.find((e) => e.daemon.id === remembered.daemonId && e.session.id === remembered.sessionId && !e.session.archived_at)
  return kept || listed[0] || null
}
