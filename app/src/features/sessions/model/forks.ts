import { entryKey, type SessionEntry } from './facets'

/** Forks (a conversation copied into a session of its own) taken out of the list and held by the entry
 *  of the session they were forked from, when that one is listed too, to be shown under it as a tree.
 *  A fork of a fork is held by its own parent. A fork whose parent is not listed stays a row of the list. */
export function foldForks(entries: SessionEntry[]): { shown: SessionEntry[]; forks: Map<string, SessionEntry[]> } {
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const parentOf = (entry: SessionEntry) => {
    const { session, daemon } = entry
    if (!session.fork_of || session.side_chat) return null
    const parent = entryKey(daemon.id, session.fork_of)
    return byKey.has(parent) ? parent : null
  }
  // Held only when a chain of parents reaches a listed row (not a loop of forks of each other).
  const rooted = (entry: SessionEntry) => {
    const seen = new Set<string>()
    for (let key: string | null = entry.key; key; key = parentOf(byKey.get(key)!)) {
      if (seen.has(key)) return false
      seen.add(key)
    }
    return true
  }
  const forks = new Map<string, SessionEntry[]>()
  const shown = entries.filter((entry) => {
    const parent = parentOf(entry)
    if (!parent || !rooted(entry)) return true
    forks.set(parent, [...(forks.get(parent) ?? []), entry])
    return false
  })
  return { shown, forks }
}

/** An entry's forks, theirs, and so on: what a row holds under it. */
export function forksUnder(key: string, forks: Map<string, SessionEntry[]>): SessionEntry[] {
  return (forks.get(key) ?? []).flatMap((fork) => [fork, ...forksUnder(fork.key, forks)])
}
