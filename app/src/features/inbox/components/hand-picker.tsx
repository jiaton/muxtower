import { Star, Users } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ink, look } from '@/components/ui/intents'
import { ProjectIcon } from '@/components/ui/project-hue'
import { Loading } from '@/components/ui/skeleton'
import type { HandTarget, HandoffTargets } from '@/lib/api/types'
import { useHandoffTargets, useSaveHandoff } from '@/lib/handoff'
import { cn } from '@/lib/cn'
import type { InboxProject } from '../model/item'

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.toLowerCase() === b.toLowerCase())

/** The project's default role, when someone in it holds it now: what is picked before the owner picks. */
function preset(targets: HandoffTargets | undefined): HandTarget | null {
  const role = targets?.roles.find((r) => same(r.role, targets.default_role))
  return targets && role ? { project: targets.project, role: role.role, session_id: null } : null
}

/**
 * Whom an item goes to: a project, then a role in it (whoever holds it) or one of its sessions. The project's
 * default hand-off role, when someone holds it, is picked to begin with, so handing is one click. `target` is
 * what the owner picked, else that default; null while nothing can be picked.
 */
export function useHandPick(startProject: string | null, start: HandTarget | null = null) {
  const [project, setProject] = useState<string | null>(start?.project ?? startProject)
  const [chosen, setChosen] = useState<HandTarget | null>(start)
  const [sessionsShown, setSessionsShown] = useState(Boolean(start?.session_id))
  const targets = useHandoffTargets(project)
  const mine = chosen && chosen.project === project ? chosen : null
  return {
    project,
    targets,
    target: mine ?? preset(targets.data),
    /** Whether the project's sessions are listed (else behind "Or a specific session"). */
    sessionsShown,
    showSessions: () => setSessionsShown(true),
    pickProject: (name: string) => setProject(name),
    choose: (target: HandTarget) => setChosen(target),
  }
}

export type HandPick = ReturnType<typeof useHandPick>

/** Who `target` is, as the preview and a handed row say it: the role, or the session by name. */
export function targetName(target: HandTarget, targets: HandoffTargets | undefined): string {
  if (target.role) return target.role
  return targets?.sessions.find((s) => s.id === target.session_id)?.name ?? target.session_id ?? ''
}

/** "Sends this as a task to <role> in <project>" (or to <session>). */
export function previewOf(target: HandTarget | null, targets: HandoffTargets | undefined): string | null {
  if (!target) return null
  const who = targetName(target, targets)
  return target.role ? `Sends this as a task to ${who} in ${target.project}` : `Sends this as a task to ${who}`
}

function Choice({ picked, onPick, children }: { picked: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <Button variant="option" role="radio" aria-checked={picked} onClick={onPick} className="w-full">
      <span className="flex w-full min-w-0 items-center gap-2">{children}</span>
    </Button>
  )
}

const sessionsHeld = (n: number) => `${n} session${n === 1 ? '' : 's'}`

/** The roles and sessions of the picked project, "No one to hand to yet" when it has none, and "Make this the
 *  default" for a role that is not. */
function Targets({ pick }: { pick: HandPick }) {
  const save = useSaveHandoff()
  const { targets, target, project, sessionsShown } = pick
  if (!project) return <p className={ink.hint}>Pick a project first.</p>
  if (targets.isPending) return <Loading label="Looking for its team…" />
  if (targets.isError) return <p className={ink.noteDanger}>{targets.error.message}</p>
  const data = targets.data
  if (!data.roles.length && !data.sessions.length && !target)
    return (
      <div className={cn(look.panel, 'flex flex-col gap-1 p-3')} role="status">
        <p className={ink.strong}>No one to hand to yet</p>
        <p className={ink.hint}>{project} has no sessions running. Start one, then hand this to it.</p>
      </div>
    )
  const isDefault = (role: string) => same(role, data.default_role)
  const pickedRole = target?.role ?? null
  // A role picked before (a stored hand-off when due) that no one holds now: still shown, said so.
  const roles =
    pickedRole && !data.roles.some((r) => same(r.role, pickedRole)) ? [...data.roles, { role: pickedRole, sessions: 0 }] : data.roles
  return (
    <div className="flex flex-col gap-3">
      {roles.length ? (
        <div role="radiogroup" aria-label="Role" className="flex flex-col gap-1">
          <span className={ink.eyebrow}>A role</span>
          {roles.map((r) => (
            <Choice key={r.role} picked={same(pickedRole, r.role)} onPick={() => pick.choose({ project, role: r.role, session_id: null })}>
              <Users aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{r.role}</span>
              {isDefault(r.role) ? <span className={look.tag}>Default</span> : null}
              <span className={cn('shrink-0', ink.meta)}>{r.sessions ? sessionsHeld(r.sessions) : 'no one holds it now'}</span>
            </Choice>
          ))}
          {pickedRole && !isDefault(pickedRole) ? (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={save.isPending}
              onClick={() => save.mutate({ project, role: pickedRole })}
            >
              <Star aria-hidden /> Make this the default
            </Button>
          ) : null}
        </div>
      ) : null}
      {data.sessions.length && roles.length && !sessionsShown && !target?.session_id ? (
        <Button variant="ghost" size="sm" className="self-start" aria-expanded={false} onClick={pick.showSessions}>
          Or a specific session · {data.sessions.length}
        </Button>
      ) : data.sessions.length ? (
        <div role="radiogroup" aria-label="Session" className="flex flex-col gap-1">
          <span className={ink.eyebrow}>Or a session</span>
          {data.sessions.map((s) => (
            <Choice key={s.id} picked={target?.session_id === s.id} onPick={() => pick.choose({ project, role: null, session_id: s.id })}>
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.role ? <span className={cn('shrink-0 truncate', ink.meta)}>{s.role}</span> : null}
            </Choice>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The picker: the projects (their colour dots), then whom in the picked one, then what will happen. */
export function HandPicker({ pick, projects }: { pick: HandPick; projects: InboxProject[] }) {
  const preview = previewOf(pick.target, pick.targets.data)
  const list = useRef<HTMLDivElement>(null)
  // The project picked to begin with may be further down the list: brought into view once.
  useEffect(() => {
    list.current?.querySelector('[aria-checked="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [])
  return (
    <div className="flex flex-col gap-3">
      <div ref={list} role="radiogroup" aria-label="Project" className="flex max-h-36 flex-col gap-1 overflow-y-auto">
        {projects.map((p) => (
          <Choice key={p.name} picked={pick.project === p.name} onPick={() => pick.pickProject(p.name)}>
            <ProjectIcon hue={p.hue} className="size-4" />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
          </Choice>
        ))}
      </div>
      <Targets pick={pick} />
      {preview ? <p className={ink.hint}>{preview}</p> : null}
    </div>
  )
}
