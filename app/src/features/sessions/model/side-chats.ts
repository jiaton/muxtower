import { entryKey, type SessionEntry } from './facets'

/** Side chats (Claude desktop's questions asked on the side of a session) taken out of the list and held
 *  by the entry of the session they were asked beside, when that one is listed too. One that needs you
 *  stays in the list, where it can be answered. */
export function foldSideChats(entries: SessionEntry[]): { shown: SessionEntry[]; sideChats: Map<string, SessionEntry[]> } {
  const keys = new Set(entries.map((e) => e.key))
  const sideChats = new Map<string, SessionEntry[]>()
  const shown = entries.filter((entry) => {
    const { session, daemon } = entry
    const parent = session.fork_of ? entryKey(daemon.id, session.fork_of) : null
    if (!session.side_chat || !parent || !keys.has(parent) || session.needs_attention) return true
    sideChats.set(parent, [...(sideChats.get(parent) ?? []), entry])
    return false
  })
  return { shown, sideChats }
}
