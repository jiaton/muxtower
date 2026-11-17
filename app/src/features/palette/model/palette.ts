/** What the palette offers: sessions (ranked by `match.ts`, or before anything is typed, those opened here
 *  lately, then those waiting on the owner) and commands (matched by their name). */
import { statusOf, type SessionEntry } from '@/features/sessions/model/facets'
import { rank, searchTerms } from '@/features/sessions/model/match'

export const SHOWN = 8 // sessions offered at a time

export function paletteSessions(entries: SessionEntry[], query: string, recent: string[], now = Date.now()): SessionEntry[] {
  const live = entries.filter((e) => !e.session.archived_at)
  if (query.trim()) return rank(entries, query, now).slice(0, SHOWN)
  const byKey = new Map(live.map((e) => [e.key, e]))
  const opened = recent.flatMap((k) => byKey.get(k) ?? []).slice(0, SHOWN - 2)
  const waiting = live.filter((e) => statusOf(e.session) === 'needs' && !opened.includes(e))
  return [...opened, ...waiting].slice(0, SHOWN)
}

export interface Command {
  id: string
  label: string
  keys?: string
  run: () => void
}

/** Commands whose name has every typed word in it (none typed: all of them); none for a facet search. */
export function matchCommands(commands: Command[], query: string): Command[] {
  const terms = searchTerms(query)
  if (terms.roles.length || terms.projects.length) return []
  const words = terms.text.split(/\s+/).filter(Boolean)
  return commands.filter((c) => words.every((w) => c.label.toLowerCase().includes(w)))
}
