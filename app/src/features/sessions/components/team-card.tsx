import { useNavigate } from '@tanstack/react-router'
import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusDot } from '@/components/ui/status-dot'
import { useLatestTasks } from '../api/use-latest-tasks'
import { STATUSES, deviceOf, statusOf, type SessionEntry } from '../model/facets'
import { folderToStart, teamOf } from '../model/team'
import { NewSessionDialog } from './new-session-dialog'
import { RenameProjectDialog } from './rename-project-dialog'
import { text, textRole } from '@/components/ui/styles'

const HOVER_MS = 500
const LEAVE_MS = 200
const HOLD_MS = 500
const TONE: Record<string, 'warn' | 'error' | 'ok' | 'idle'> = { needs: 'warn', error: 'error', working: 'ok' }
const STATE = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]))

/**
 * A project's team on a row that shows the project (a sidebar row, a project chip): on hover (after half
 * a second, gone when the pointer leaves both), or with its actions on a right click or a long press.
 * Every known session of the project, on every device: its state, name, role, device, and the last task
 * it was sent; a tap opens it. Actions: rename the project for all its sessions, start a session in it.
 * The row's own click (or tap) is left as it is.
 */
export function TeamCard({
  project,
  entries,
  device,
  children,
}: {
  project: string | null
  entries: SessionEntry[]
  /** The device whose row it is: where "New session here…" starts. */
  device?: string
  children: ReactNode
}) {
  const [shown, setShown] = useState<Shown | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const press = useRef<{ x: number; y: number } | null>(null)
  const held = useRef(false)
  const members = project ? teamOf(entries, project) : []
  if (!project || !members.length) return <>{children}</>

  const later = (then: () => void, ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(then, ms)
  }
  const keep = () => window.clearTimeout(timer.current)
  const leave = () => {
    if (shown?.pinned) return
    later(() => setShown(null), LEAVE_MS)
  }
  const pin = (x: number, y: number) => {
    keep()
    setShown({ pinned: true, x, y })
  }
  return (
    <div
      className="relative [-webkit-touch-callout:none]"
      onPointerEnter={(e: PointerEvent) => {
        if (e.pointerType === 'mouse' && !shown?.pinned) later(() => setShown({ pinned: false }), shown ? 0 : HOVER_MS)
      }}
      onPointerLeave={(e: PointerEvent) => e.pointerType === 'mouse' && leave()}
      onContextMenu={(e: MouseEvent) => {
        e.preventDefault() // the browser's own menu is not this row's
        pin(e.clientX, e.clientY)
      }}
      onPointerDown={(e: PointerEvent) => {
        if (e.pointerType === 'mouse') return
        held.current = false
        press.current = { x: e.clientX, y: e.clientY }
        const { clientX, clientY } = e
        later(() => {
          held.current = true
          pin(clientX, clientY)
        }, HOLD_MS)
      }}
      onPointerMove={(e: PointerEvent) => {
        if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) {
          keep() // scrolling
          press.current = null
        }
      }}
      onPointerUp={() => {
        if (!held.current) keep()
        press.current = null
      }}
      onClickCapture={(e) => {
        if (held.current) {
          e.preventDefault() // the press showed the card: no opening the row too
          e.stopPropagation()
        }
        held.current = false
      }}
    >
      {children}
      <TeamPanel
        project={project}
        members={members}
        device={device}
        shown={shown}
        onClose={() => setShown(null)}
        onEnter={keep}
        onLeave={leave}
      />
    </div>
  )
}

/** Where a team card shows: by its row (hover), or pinned where it was pressed, with its actions. */
export interface Shown {
  pinned: boolean
  x?: number
  y?: number
}

/** The card itself, for whoever decides when it shows (a row's hover or press, a group chip's menu). */
export function TeamPanel({
  project,
  members,
  device,
  shown,
  onClose,
  onEnter,
  onLeave,
}: {
  project: string
  members: SessionEntry[]
  device?: string
  shown: Shown | null
  onClose: () => void
  onEnter?: () => void
  onLeave?: () => void
}) {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'rename' | 'new' | null>(null)
  const tasks = useLatestTasks(members, Boolean(shown))
  const start = folderToStart(members, device)
  return (
    <>
      <DropdownMenu open={Boolean(shown)} onOpenChange={(open) => open || onClose()}>
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            tabIndex={-1}
            className={shown?.pinned ? 'pointer-events-none fixed size-0' : 'pointer-events-none absolute top-0 right-0 h-full w-0'}
            style={shown?.pinned ? { left: shown.x, top: shown.y } : undefined}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={shown?.pinned ? 'bottom' : 'right'}
          align="start"
          sideOffset={shown?.pinned ? 12 : 8}
          className="w-80 max-w-[calc(100vw-2rem)]"
          onPointerEnter={onEnter}
          onPointerLeave={onLeave}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()} // the press's own click focuses the row: no closing on it
          aria-label={`Team of ${project}`}
        >
          <DropdownMenuLabel>
            {project} · {members.length} session{members.length === 1 ? '' : 's'}
          </DropdownMenuLabel>
          {members.map(({ daemon, session }) => {
            const status = statusOf(session)
            const task = tasks.get(session.id)
            return (
              <DropdownMenuItem
                key={`${daemon.id}/${session.id}`}
                className="flex-col items-stretch gap-0.5"
                onSelect={() =>
                  void navigate({ to: '/d/$daemonId/s/$sessionId', params: { daemonId: daemon.id, sessionId: session.id }, search: true })
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <StatusDot tone={TONE[status] ?? 'idle'} label={STATE[status] ?? status} />
                  <span className={`${text({ weight: 'medium' })} min-w-0 flex-1 truncate`}>{session.name}</span>
                  <span className={`${textRole.meta} shrink-0`}>{STATE[status] ?? status}</span>
                </span>
                <span className={`${textRole.meta} flex min-w-0 gap-1 pl-4`}>
                  <span className={session.team_role ? 'min-w-0 truncate' : `${text({ italic: true })} shrink-0`}>
                    {session.team_role ?? 'no role'}
                  </span>
                  <span className="shrink-0">· {deviceOf(session) ?? daemon.name}</span>
                </span>
                {task ? <span className={`${textRole.meta} truncate pl-4`}>{task.text}</span> : null}
              </DropdownMenuItem>
            )
          })}
          {shown?.pinned ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDialog('rename')}>Rename project…</DropdownMenuItem>
              {start ? <DropdownMenuItem onSelect={() => setDialog('new')}>New session here…</DropdownMenuItem> : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === 'rename' ? <RenameProjectDialog project={project} member={members[0]} onClose={() => setDialog(null)} /> : null}
      {dialog === 'new' && start ? (
        <NewSessionDialog
          open
          onOpenChange={(open) => open || setDialog(null)}
          preset={{
            daemonId: start.entry.daemon.id,
            node: start.entry.session.id.includes('~') ? (start.entry.session.machine ?? null) : null,
            cwd: start.cwd,
            project,
          }}
        />
      ) : null}
    </>
  )
}
