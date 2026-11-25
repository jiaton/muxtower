/**
 * What the group dialog has ticked: projects whole (their sessions to come included) and single sessions
 * besides (a fixed list: ticking each session of a project one by one never turns into the project). A
 * project shows "all" when held whole, "some" when the group holds sessions of it but not it, else none.
 * Sessions the group held that are no longer known (archived, gone) are not shown, and not kept on save.
 * A project the group holds that no session has, live or archived, is `gone`: the dialog offers to remove it
 * (a rename or a typo leaves one); one only archived sessions have is still a project. A project whose every
 * session belongs to by its folder (`belongs.ts`) is a `folder`, said as one.
 */
import type { Session } from '@/lib/api/types'
import { MAX_PROJECTS, MAX_ROLES, MAX_SESSIONS, OTHER, chipProjectOf, projectLabel, type ChipGroup, type ChipMembers } from './chip-groups'
import { belongingsOf } from './belongs'
import { placeOf, roleKeyOf, roleLabels, statusOf, type SessionEntry } from './facets'

export type PickState = 'all' | 'some' | 'none'

export interface ShownProject {
  project: string
  sessions: SessionEntry[]
  expanded: boolean
}

export interface Picks {
  sessionsOf: (project: string) => SessionEntry[]
  /** Held by the group, and no session has it, live or archived. */
  gone: (project: string) => boolean
  /** A folder's name, not a project: every session of it (archived ones too) is placed only by its folder. */
  folder: (project: string) => boolean
  /** Without it: no longer listed or held (Remove, saved at once). */
  drop: (project: string) => Picks
  state: (project: string) => PickState
  holds: (project: string, sessionId: string) => boolean
  canTake: (projectOrSession: string) => boolean
  toggleProject: (project: string) => Picks
  toggleSession: (project: string, sessionId: string) => Picks
  shown: (q: string, open: string[]) => ShownProject[]
  /** The roles known sessions have, by how many hold each (then the ones the group holds that none has now). */
  roles: { key: string; label: string; count: number }[]
  hasRole: (key: string) => boolean
  toggleRole: (key: string) => Picks
  members: () => ChipMembers
  empty: () => boolean
  status: (session: Session) => string
}

const recent = (a: SessionEntry, b: SessionEntry) => Date.parse(b.session.updated_at) - Date.parse(a.session.updated_at)

/** The projects of the known (not archived) sessions, those needing the owner first, then by activity, then
 *  the ones the group holds that no session has now; Other last. */
function projectsOf(entries: SessionEntry[], held: string[]): { order: string[]; by: Map<string, SessionEntry[]>; kinds: Kinds } {
  const by = new Map<string, SessionEntry[]>()
  const kinds: Kinds = { known: new Set(), projects: new Set() }
  const places = belongingsOf(entries)
  for (const entry of entries) {
    const project = chipProjectOf(entry, places)
    kinds.known.add(project)
    if (places(entry).kind === 'project') kinds.projects.add(project)
    if (placeOf(entry.session) === 'archived') continue
    by.set(project, [...(by.get(project) ?? []), entry])
  }
  for (const list of by.values()) list.sort(recent)
  const needs = (p: string) => by.get(p)!.some((e) => e.session.needs_attention)
  const latest = (p: string) => Date.parse(by.get(p)![0].session.updated_at) || 0
  const known = [...by.keys()].filter((p) => p !== OTHER).sort((a, b) => Number(needs(b)) - Number(needs(a)) || latest(b) - latest(a))
  const kept = held.filter((p) => p !== OTHER && !by.has(p))
  return { order: [...known, ...kept, OTHER], by, kinds }
}

/** What every session says of a project name, archived ones too: that some session has it (`known`), and
 *  that some has it as a project, not only as its folder's name (`projects`). */
interface Kinds {
  known: Set<string>
  projects: Set<string>
}

/** Every role key the known sessions have, the most held first, then those `held` that none has now. */
function rolesOf(entries: SessionEntry[], held: string[]): Picks['roles'] {
  const sessions = entries.filter((e) => placeOf(e.session) !== 'archived').map((e) => e.session)
  const labels = roleLabels(sessions)
  const count = new Map<string, number>()
  for (const s of sessions) {
    const key = roleKeyOf(s)
    if (key) count.set(key, (count.get(key) ?? 0) + 1)
  }
  const known = [...count]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, n]) => ({ key, label: labels.get(key)!, count: n }))
  return [...known, ...held.filter((k) => !count.has(k)).map((key) => ({ key, label: key, count: 0 }))]
}

export function groupPicks(entries: SessionEntry[], group?: ChipGroup): Picks {
  const { order, by, kinds } = projectsOf(entries, group?.projects ?? [])
  const known = new Set([...by.values()].flat().map((e) => e.session.id))
  const roles = rolesOf(entries, group?.roles ?? [])
  return picks(
    order,
    by,
    kinds,
    roles,
    new Set(group?.projects ?? []),
    new Set((group?.sessions ?? []).filter((id) => known.has(id))),
    new Set(group?.roles ?? []),
  )
}

function picks(
  order: string[],
  by: Map<string, SessionEntry[]>,
  kinds: Kinds,
  roleList: Picks['roles'],
  projects: Set<string>,
  sessions: Set<string>,
  roles: Set<string>,
): Picks {
  const sessionsOf = (project: string) => by.get(project) ?? []
  const idsOf = (project: string) => sessionsOf(project).map((e) => e.session.id)
  const next = (p: Set<string>, s: Set<string>, r = roles) => picks(order, by, kinds, roleList, p, s, r)
  const self: Picks = {
    roles: roleList,
    hasRole: (key) => roles.has(key),
    toggleRole: (key) => {
      const r = new Set(roles)
      if (r.has(key)) r.delete(key)
      else if (r.size < MAX_ROLES) r.add(key)
      return next(projects, sessions, r)
    },
    sessionsOf,
    gone: (project) => project !== OTHER && projects.has(project) && !kinds.known.has(project),
    folder: (project) => project !== OTHER && kinds.known.has(project) && !kinds.projects.has(project),
    drop: (project) => {
      const p = new Set(projects)
      p.delete(project)
      return picks(
        order.filter((x) => x !== project),
        by,
        kinds,
        roleList,
        p,
        sessions,
        roles,
      )
    },
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
    members: () => ({ projects: order.filter((p) => projects.has(p)), sessions: [...sessions], roles: [...roles] }),
    empty: () => !projects.size && !sessions.size && !roles.size,
    status: (session) => statusOf(session),
  }
  return self
}
