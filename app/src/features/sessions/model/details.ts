import type { Session } from '@/lib/api/types'
import { ago } from '@/lib/time'
import { NO_ENVIRONMENT, agentOf, deviceOf, folderOf, roleNameOf, sourceOf } from './facets'

/** One line of a session's details: what it is, its value as said ("—" when it has none), and, for a
 *  path or an id, the text a copy button puts on the clipboard. */
export interface Detail {
  label: string
  value: string
  code?: boolean
  copy?: string
}

/** The three tags under a session's name: its role's name, its project, its machine; each with what its
 *  tooltip says. One it does not have is left out. */
export function headerTags(session: Session): { key: 'role' | 'project' | 'machine'; text: string; title: string }[] {
  const role = roleNameOf(session)
  const project = session.project?.trim()
  const machine = deviceOf(session)
  return [
    role ? { key: 'role' as const, text: role, title: session.team_role!.trim() } : null,
    project ? { key: 'project' as const, text: project, title: `Project: ${project}` } : null,
    machine ? { key: 'machine' as const, text: machine, title: `Machine: ${machine}` } : null,
  ].filter((t) => t !== null)
}

const NONE = '—'

/** A time as said in the details: the date and time here, and how long ago. */
export const when = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return NONE
  const since = ago(iso, now)
  return `${new Date(iso).toLocaleString()} (${since === 'now' ? 'just now' : `${since} ago`})`
}

/** Where the project came from (`project_source`), said as it is, and marked when muxtower worked it out. */
function projectFrom(session: Session): string {
  if (!session.project_source) return NONE
  return session.project_auto ? `${session.project_source} (worked out by muxtower)` : session.project_source
}

/** Every fact about a session, each the same way: none left out because it is the usual one. The ones
 *  only some sessions have (where its agent went since, the tmux pane, its repository) come where they are
 *  known; the rest are always there, "—" when not known. */
export function sessionDetails(session: Session, now = Date.now()): Detail[] {
  const git = session.git
  const tmux = session.tmux_session ? [session.tmux_session, session.tmux_pane].filter(Boolean).join(' ') : null
  const rows: (Detail | null)[] = [
    { label: 'Role', value: session.team_role?.trim() || NONE },
    { label: 'Note', value: session.team_note?.trim() || NONE },
    { label: 'Project', value: session.project || NONE },
    { label: 'Project from', value: projectFrom(session) },
    { label: 'Machine', value: deviceOf(session) ?? NO_ENVIRONMENT },
    session.node ? { label: 'Reached through', value: session.node } : null,
    session.account ? { label: 'Account', value: session.account } : null,
    { label: 'Agent', value: agentOf(session) },
    { label: 'Folder', value: folderOf(session) ?? NONE, code: true, copy: session.cwd || undefined },
    session.working_dir
      ? {
          label: 'Working in',
          value: folderOf({ ...session, cwd: session.working_dir }) ?? session.working_dir,
          code: true,
          copy: session.working_dir,
        }
      : null,
    { label: 'Permission mode', value: session.permission_mode || NONE },
    { label: 'Started by', value: sourceOf(session) },
    session.origin ? { label: 'Origin', value: session.origin } : null,
    tmux ? { label: 'tmux', value: tmux, code: true } : null,
    git ? { label: 'Repository', value: git.remote || (folderOf({ ...session, cwd: git.repo }) ?? git.repo), code: true } : null,
    git ? { label: 'Branch', value: git.branch ?? 'detached', code: true } : null,
    git && git.worktree !== git.repo
      ? { label: 'Worktree', value: folderOf({ ...session, cwd: git.worktree }) ?? git.worktree, code: true, copy: git.worktree }
      : null,
    { label: 'Created', value: when(session.created_at, now) },
    { label: 'Last activity', value: when(session.output_at ?? session.updated_at, now) },
    { label: 'Session id', value: session.id, code: true, copy: session.id },
    { label: 'Remote id', value: session.remote_id || NONE, code: true, copy: session.remote_id || undefined },
  ]
  // No value: the plain "—" (in the code font it reads as a narrower dash than the other rows').
  return rows.filter((r) => r !== null).map((r) => (r.value === NONE ? { ...r, code: false } : r))
}
