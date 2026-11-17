import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Session } from '@/lib/api/types'
import { useUpdateSession } from '../api/use-session-mutations'
import { NotifyItems } from './notify-items'
import { ACTION_KEYS, SessionActions, type SessionAction } from './session-actions'

const MENU_LABEL: Record<SessionAction['id'], (session: Session) => string> = {
  read: (s) => (s.unread ? 'Mark as read' : 'Mark as unread'),
  pin: (s) => (s.pinned ? 'Unpin' : 'Pin to the top'),
  new: () => 'New session here…',
  rename: () => 'Rename',
  place: () => 'Move…',
  team: () => 'Team…',
  hide: (s) => (s.hidden ? 'Show in the list' : 'Hide from the list'),
  archive: () => 'Archive',
  interrupt: () => 'Interrupt (Esc)',
  delete: (s) => (s.interrupted_at ? 'Delete' : 'Delete from the archive'),
  resume: (s) => (s.archived_at ? 'Resume' : 'Start again'),
}

/** What an action's item says under its label: the session's role, for Team (the label stays short). */
const DETAIL: Partial<Record<SessionAction['id'], (session: Session) => string>> = {
  team: (s) => s.team_role || 'No role yet',
  archive: () => 'Ends the agent, keeps the history',
  resume: (s) => (s.archived_at ? 'Starts it again, its conversation where it left off' : ''),
}

const DANGER: ReadonlySet<SessionAction['id']> = new Set(['delete'])

function Items({ session, actions }: { session: Session; actions: SessionAction[] }) {
  return actions.map((a) => (
    <DropdownMenuItem
      key={a.id}
      icon={a.icon}
      detail={a.disabled ?? (DETAIL[a.id]?.(session) || undefined)}
      disabled={Boolean(a.disabled)}
      tone={a.tone === 'danger' ? 'danger' : undefined}
      shortcut={ACTION_KEYS[a.id]}
      onSelect={a.run}
    >
      {MENU_LABEL[a.id](session)}
    </DropdownMenuItem>
  ))
}

/** The session actions as menu items (a row's menu, the session page's menu), each with its key, under
 *  "Session"; Delete (an archived session's, or one a restart interrupted) apart, last (`SessionEndItems`). */
export function SessionActionItems({ session, actions }: { session: Session; actions: SessionAction[] }) {
  const kept = actions.filter((a) => !DANGER.has(a.id))
  if (!kept.length) return null
  return (
    <>
      <DropdownMenuLabel>Session</DropdownMenuLabel>
      <Items session={session} actions={kept} />
    </>
  )
}

/** The actions that end a session, last in its menu, set apart. */
export function SessionEndItems({ session, actions }: { session: Session; actions: SessionAction[] }) {
  const ending = actions.filter((a) => DANGER.has(a.id))
  if (!ending.length) return null
  return (
    <>
      <DropdownMenuSeparator />
      <Items session={session} actions={ending} />
    </>
  )
}

/** The session page's "⋯" menu: other features' entries first (`items`, e.g. terminal settings), then
 *  what can be done to the session, auto-approve where its runtime allows it, and its notifications. */
export function SessionActionsMenu({ daemonId, session, items }: { daemonId: string; session: Session; items?: ReactNode }) {
  const update = useUpdateSession(daemonId, session.id)
  return (
    <SessionActions daemonId={daemonId} session={session} open>
      {(actions) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions" title="More">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-60">
            {items}
            {items ? <DropdownMenuSeparator /> : null}
            <SessionActionItems session={session} actions={actions} />
            {session.can_auto_approve && !session.archived_at ? (
              <DropdownMenuCheckboxItem
                checked={session.auto_approve}
                onCheckedChange={(on) => update.mutate({ auto_approve: on === true })}
              >
                Auto-approve prompts
              </DropdownMenuCheckboxItem>
            ) : null}
            <NotifyItems daemonId={daemonId} session={session} />
            <SessionEndItems session={session} actions={actions} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </SessionActions>
  )
}
