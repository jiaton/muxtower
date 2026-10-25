import { useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff, Mail, MailOpen, Pencil, Power, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Session } from '@/lib/api/types'
import { useTerminateSession, useUpdateSession } from '../api/use-session-mutations'
import { useHideSession, useMarkRead } from '../api/use-session-marks'

export interface SessionAction {
  id: 'read' | 'rename' | 'hide' | 'stop'
  label: string
  icon: LucideIcon
  tone?: 'accent' | 'neutral' | 'danger'
  run: () => void
}

/** What the owner can do to a session from anywhere it is shown (a list row's swipe tray or menu, the
 *  session's own menu): mark read or unread, rename, hide or show, stop; rename and stop only where its
 *  capabilities allow. Renders `children(actions)` plus the dialogs they open. `open`: the session is the
 *  page being shown, so marking it unread or hiding it goes back to the list first (an open session is
 *  read, and a hidden one has no place beside the list). */
export function SessionActions({
  daemonId,
  session,
  open = false,
  children,
}: {
  daemonId: string
  session: Session
  open?: boolean
  children: (actions: SessionAction[]) => ReactNode
}) {
  const navigate = useNavigate()
  const markRead = useMarkRead()
  const hide = useHideSession()
  const [dialog, setDialog] = useState<'rename' | 'stop' | null>(null)
  const ids = { daemonId, sessionId: session.id }
  const leaving = (then: () => void) => (open ? () => void navigate({ to: '/', search: true }).then(then) : then)

  const actions: SessionAction[] = [
    session.unread
      ? { id: 'read', label: 'Read', icon: MailOpen, tone: 'accent', run: () => markRead.mutate({ ...ids, read: true }) }
      : { id: 'read', label: 'Unread', icon: Mail, tone: 'accent', run: leaving(() => markRead.mutate({ ...ids, read: false })) },
  ]
  if (session.capabilities.rename)
    actions.push({ id: 'rename', label: 'Rename', icon: Pencil, tone: 'neutral', run: () => setDialog('rename') })
  actions.push(
    session.hidden
      ? { id: 'hide', label: 'Show', icon: Eye, tone: 'neutral', run: () => hide.mutate({ ...ids, hidden: false }) }
      : { id: 'hide', label: 'Hide', icon: EyeOff, tone: 'neutral', run: leaving(() => hide.mutate({ ...ids, hidden: true })) },
  )
  if (session.capabilities.terminate) actions.push({ id: 'stop', label: 'Stop', icon: Power, tone: 'danger', run: () => setDialog('stop') })

  return (
    <>
      {children(actions)}
      {dialog === 'rename' ? <RenameDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === 'stop' ? (
        <StopDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} onStopped={leaving(() => {})} />
      ) : null}
    </>
  )
}

function RenameDialog({ daemonId, session, onClose }: { daemonId: string; session: Session; onClose: () => void }) {
  const update = useUpdateSession(daemonId, session.id)
  const [name, setName] = useState(session.name)
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent title="Rename session">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            update.mutate({ name: name.trim() }, { onSuccess: onClose })
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
  )
}

function StopDialog({
  daemonId,
  session,
  onClose,
  onStopped,
}: {
  daemonId: string
  session: Session
  onClose: () => void
  onStopped: () => void
}) {
  const terminate = useTerminateSession(daemonId, session.id)
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent title={`Stop ${session.name}?`} description="This ends the agent and kills its tmux session.">
        {terminate.error ? <Banner tone="error">{terminate.error.message}</Banner> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={terminate.isPending}
            onClick={() =>
              terminate.mutate(undefined, {
                onSuccess: () => {
                  onClose()
                  onStopped()
                },
              })
            }
          >
            <Power /> Stop
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
