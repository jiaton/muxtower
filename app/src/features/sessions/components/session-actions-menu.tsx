import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Session } from '@/lib/api/types'
import { useUpdateSession } from '../api/use-session-mutations'
import { NotifyItems } from './notify-items'
import { SessionActions, type SessionAction } from './session-actions'

const MENU_LABEL: Record<SessionAction['id'], (session: Session) => string> = {
  read: (s) => (s.unread ? 'Mark as read' : 'Mark as unread'),
  pin: (s) => (s.pinned ? 'Unpin' : 'Pin to the top'),
  new: () => 'New session here…',
  rename: () => 'Rename',
  place: () => 'Move…',
  team: (s) => (s.team_role ? `Team: ${s.team_role}…` : 'Set its role…'),
  hide: (s) => (s.hidden ? 'Show in the list' : 'Hide from the list'),
  archive: () => 'Archive',
  stop: () => 'Stop session',
  delete: (s) => (s.interrupted_at ? 'Delete' : 'Delete from the archive'),
  resume: () => 'Start again',
}

/** The session actions as menu items (a row's hover menu, the session page's menu). */
export function SessionActionItems({ session, actions }: { session: Session; actions: SessionAction[] }) {
  return actions.map((a) => (
    <DropdownMenuItem key={a.id} tone={a.tone === 'danger' ? 'danger' : undefined} onSelect={a.run}>
      <a.icon /> {MENU_LABEL[a.id](session)}
    </DropdownMenuItem>
  ))
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
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </SessionActions>
  )
}
