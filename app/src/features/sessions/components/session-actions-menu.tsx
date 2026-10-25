import { useNavigate } from '@tanstack/react-router'
import { Mail, MoreHorizontal, Pencil, Power } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { Session } from '@/lib/api/types'
import { useMarkRead } from '../api/use-mark-read'
import { useTerminateSession, useUpdateSession } from '../api/use-session-mutations'

/** The session page's "⋯" menu: mark unread (to come back to; leaves the page, which would read it
 *  again), then what this session's capabilities allow (rename, auto-approve, stop). `items` is a slot
 *  for other features' entries (terminal settings), shown first. */
export function SessionActionsMenu({ daemonId, session, items }: { daemonId: string; session: Session; items?: ReactNode }) {
  const update = useUpdateSession(daemonId, session.id)
  const terminate = useTerminateSession(daemonId, session.id)
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'rename' | 'stop' | null>(null)
  const [name, setName] = useState(session.name)
  const markRead = useMarkRead()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions" title="More">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-60">
          {items}
          {items ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onSelect={() =>
              // Leave first: while it is open, the page marks it read again.
              void navigate({ to: '/', search: true }).then(() => markRead.mutate({ daemonId, sessionId: session.id, read: false }))
            }
          >
            <Mail /> Mark as unread
          </DropdownMenuItem>
          {session.capabilities.rename ? (
            <DropdownMenuItem onSelect={() => (setName(session.name), setDialog('rename'))}>
              <Pencil /> Rename
            </DropdownMenuItem>
          ) : null}
          {session.can_auto_approve ? (
            <DropdownMenuCheckboxItem checked={session.auto_approve} onCheckedChange={(on) => update.mutate({ auto_approve: on === true })}>
              Auto-approve prompts
            </DropdownMenuCheckboxItem>
          ) : null}
          {session.capabilities.terminate ? (
            <DropdownMenuItem tone="danger" onSelect={() => setDialog('stop')}>
              <Power /> Stop session
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === 'rename'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent title="Rename session">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              update.mutate({ name: name.trim() }, { onSuccess: () => setDialog(null) })
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required aria-label="Session name" autoFocus />
            {update.error ? <Banner tone="error">{update.error.message}</Banner> : null}
            <Button type="submit" disabled={update.isPending}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'stop'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent title={`Stop ${session.name}?`} description="This ends the agent and kills its tmux session.">
          {terminate.error ? <Banner tone="error">{terminate.error.message}</Banner> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={terminate.isPending}
              onClick={() => terminate.mutate(undefined, { onSuccess: () => void navigate({ to: '/', search: true }) })}
            >
              <Power /> Stop
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
