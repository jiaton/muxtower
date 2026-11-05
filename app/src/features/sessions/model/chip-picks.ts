/**
 * What the group dialog has ticked: projects whole (their sessions to come included) and single sessions
 * besides (a fixed list: ticking each session of a project one by one never turns into the project). A
 * project shows "all" when held whole, "some" when the group holds sessions of it but not it, else none.
 * Sessions the group held that are no longer known (archived, gone) are not shown, and not kept on save.
 */
import type { Session } from '@/lib/api/types'
import { MAX_PROJECTS, MAX_SESSIONS, OTHER, projectIn, projectLabel, type ChipGroup, type ChipMembers } from './chip-groups'
import { placeOf, statusOf, type SessionEntry } from './facets'
import { workspacesOf } from './workspaces'

export type PickState = 'all' | 'some' | 'none'

export interface ShownProject {
  project: string
  sessions: SessionEntry[]
  expanded: boolean
}

export interface Picks {
  sessionsOf: (project: string) => SessionEntry[]
  state: (project: string) => PickState
  holds: (project: string, sessionId: string) => boolean
  canTake: (projectOrSession: string) => boolean
  toggleProject: (project: string) => Picks
  toggleSession: (project: string, sessionId: string) => Picks
  shown: (q: string, open: string[]) => ShownProject[]
  members: () => ChipMembers
  empty: () => boolean
  status: (session: Session) => string
}

const recent = (a: SessionEntry, b: SessionEntry) => Date.parse(b.session.updated_at) - Date.parse(a.session.updated_at)

/** The projects of the known (not archived) sessions, those needing the owner first, then by activity, then
 *  the ones the group holds that no session has now; Other last. */
function projectsOf(entries: SessionEntry[], held: string[]): { order: string[]; by: Map<string, SessionEntry[]> } {
  const by = new Map<string, SessionEntry[]>()
  const workspaces = workspacesOf(entries)
  for (const entry of entries) {
    if (placeOf(entry.session) === 'archived') continue
    const project = projectIn(entry, workspaces)
    by.set(project, [...(by.get(project) ?? []), entry])
  }
  for (const list of by.values()) list.sort(recent)
  const needs = (p: string) => by.get(p)!.some((e) => e.session.needs_attention)
  const latest = (p: string) => Date.parse(by.get(p)![0].session.updated_at) || 0
  const known = [...by.keys()].filter((p) => p !== OTHER).sort((a, b) => Number(needs(b)) - Number(needs(a)) || latest(b) - latest(a))
  const kept = held.filter((p) => p !== OTHER && !by.has(p))
  return { order: [...known, ...kept, OTHER], by }
}

export function groupPicks(entries: SessionEntry[], group?: ChipGroup): Picks {
  const { order, by } = projectsOf(entries, group?.projects ?? [])
  const known = new Set([...by.values()].flat().map((e) => e.session.id))
  return picks(order, by, new Set(group?.projects ?? []), new Set((group?.sessions ?? []).filter((id) => known.has(id))))
}

function picks(order: string[], by: Map<string, SessionEntry[]>, projects: Set<string>, sessions: Set<string>): Picks {
  const sessionsOf = (project: string) => by.get(project) ?? []
  const idsOf = (project: string) => sessionsOf(project).map((e) => e.session.id)
  const next = (p: Set<string>, s: Set<string>) => picks(order, by, p, s)
  const self: Picks = {
    sessionsOf,
    state: (project) => (projects.has(project) ? 'all' : idsOf(project).some((id) => sessions.has(id)) ? 'some' : 'none'),
    holds: (project, id) => projects.has(project) || sessions.has(id),
    canTake: (x) => (order.includes(x) ? projects.has(x) || projects.size < MAX_PROJECTS : sessions.size < MAX_SESSIONS),
    toggleProject: (project) => {
      const p = new Set(projects)
      const s = new Set([...sessions].filter((id) => !idsOf(project).includes(id))) // the project says it all now
      if (projects.has(project)) p.delete(project)
      else p.add(project)
      return next(p, s)
    },
    toggleSession: (project, id) => {
      const p = new Set(projects)
      const s = new Set(sessions)
      if (projects.has(project)) {
        p.delete(project) // one let go of a whole project: the others stay, one by one
        for (const other of idsOf(project)) if (other !== id) s.add(other)
      } else if (s.has(id)) s.delete(id)
      else s.add(id)
      return next(p, s)
    },
    shown: (q, open) => {
      const text = q.trim().toLowerCase()
      return order.flatMap((project) => {
        const all = sessionsOf(project)
        if (!text) return [{ project, sessions: all, expanded: open.includes(project) }]
        const matching = all.filter((e) => e.session.name.toLowerCase().includes(text))
        const named = projectLabel(project).toLowerCase().includes(text)
        if (!named && !matching.length) return []
        return [{ project, sessions: matching.length ? matching : all, expanded: matching.length > 0 || open.includes(project) }]
      })
    },
    members: () => ({ projects: order.filter((p) => projects.has(p)), sessions: [...sessions] }),
    empty: () => !projects.size && !sessions.size,
    status: (session) => statusOf(session),
  }
  return self
}
