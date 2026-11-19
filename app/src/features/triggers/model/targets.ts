import type { RuntimeInfo, Session } from '@/lib/api/types'

export interface Target {
  /** what the trigger's `to` holds: role@project, or a session's id */
  value: string
  /** shown beside it: the session's name, or how many have the role */
  hint: string
  /** matched as typed too: the session's name */
  keywords?: string
}

/** A role a person would type in role@project: a word or two, not a sentence. */
const shortRole = (role: string | null | undefined) => (role && role.length <= 40 && !/\s—\s|[.,;:]/.test(role) ? role : null)

/** Where a session runs, short: its machine. */
const where = (s: Session) => s.node ?? s.machine

/** What a trigger can deliver to: each role of a project (role@project), then every session by its id,
 *  found by its name too. Archived ones are left out. */
export function targetsOf(sessions: Session[]): Target[] {
  const live = sessions.filter((s) => !s.archived_at)
  const roles = new Map<string, Session[]>()
  for (const s of live) {
    const role = shortRole(s.team_role)
    if (role && s.project) roles.set(`${role}@${s.project}`, [...(roles.get(`${role}@${s.project}`) ?? []), s])
  }
  return [
    ...[...roles].map(([value, members]) => ({
      value,
      hint: members.length === 1 ? members[0]!.name : `${members.length} sessions`,
      keywords: members.map((m) => m.name).join(' '),
    })),
    ...live.map((s) => ({ value: s.id, hint: s.name, keywords: s.name })),
  ]
}

/** Who a `to` reaches, said briefly: "→ worker in acme/shop-api, @build-box". */
export function resolvedText(found: Session[]): string {
  return `→ ${found.map((s) => `${s.team_role && shortRole(s.team_role) ? s.team_role : s.name}${s.project ? ` in ${s.project}` : ''}${where(s) ? `, @${where(s)}` : ''}`).join('; ')}`
}

/** The sessions a `to` names: the one with that id, or every live one with that role in that project. */
export function sessionsFor(to: string, sessions: Session[]): Session[] {
  const t = to.trim()
  if (!t) return []
  const at = t.lastIndexOf('@')
  const live = sessions.filter((s) => !s.archived_at)
  if (at <= 0) return live.filter((s) => s.id === t)
  const role = t.slice(0, at)
  const project = t.slice(at + 1)
  return live.filter((s) => s.team_role === role && s.project === project)
}

/** Modes that let an agent act without asking: those its runtime marks dangerous, and any bypass mode
 *  (a runtime this daemon does not list). */
export function runsUnguarded(session: Session, runtimes: RuntimeInfo[] = []): boolean {
  const mode = session.permission_mode
  if (!mode) return false
  const runtime = runtimes.find((r) => r.name === session.runtime)
  if (runtime?.permission_modes?.some((m) => m.id === mode && m.dangerous)) return true
  return /bypass|dangerously|full-access|yolo/i.test(mode)
}
