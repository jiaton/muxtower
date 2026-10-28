import { useNavigate } from '@tanstack/react-router'
import { Archive, Eye, EyeOff, FolderInput, Mail, MailOpen, Pencil, Power, Trash2, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Session } from '@/lib/api/types'
import { useArchiveSession, useTerminateSession, useUpdateSession } from '../api/use-session-mutations'
import { useHideSession, useMarkRead } from '../api/use-session-marks'
import { PlaceDialog } from './place-dialog'

export interface SessionAction {
  id: 'read' | 'rename' | 'place' | 'hide' | 'archive' | 'stop' | 'delete'
  label: string
  icon: LucideIcon
  tone?: 'accent' | 'neutral' | 'danger'
  run: () => void
}

/** What the owner can do to a session from anywhere it is shown (a list row's swipe tray or menu, the
 *  session's own menu): mark read or unread, rename, move (say where it runs), hide or show, archive, stop;
 *  rename, move, archive and stop only where its capabilities allow. An archived session can only be deleted from the archive. Renders
 *  `children(actions)` plus the dialogs they open (archive, stop and delete ask first). `open`: the session
 *  is the page being shown, so marking it unread, hiding or deleting it goes back to the list first (an
 *  open session is read, and a hidden one has no place beside the list); an archived one stays, read-only. */
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
  const [dialog, setDialog] = useState<'rename' | 'place' | 'archive' | 'stop' | 'delete' | null>(null)
  const ids = { daemonId, sessionId: session.id }
  const leaving = (then: () => void) => (open ? () => void navigate({ to: '/', search: true }).then(then) : then)

  const actions: SessionAction[] = session.archived_at
    ? [{ id: 'delete', label: 'Delete', icon: Trash2, tone: 'danger', run: () => setDialog('delete') }]
    : liveActions()

  function liveActions(): SessionAction[] {
    const live: SessionAction[] = [
      session.unread
        ? { id: 'read', label: 'Read', icon: MailOpen, tone: 'accent', run: () => markRead.mutate({ ...ids, read: true }) }
        : { id: 'read', label: 'Unread', icon: Mail, tone: 'accent', run: leaving(() => markRead.mutate({ ...ids, read: false })) },
    ]
    if (session.capabilities.rename) live.push({ id: 'rename', label: 'Rename', icon: Pencil, tone: 'neutral', run: () => setDialog('rename') })
    if (session.capabilities.place) live.push({ id: 'place', label: 'Move', icon: FolderInput, tone: 'neutral', run: () => setDialog('place') })
    live.push(
      session.hidden
        ? { id: 'hide', label: 'Show', icon: Eye, tone: 'neutral', run: () => hide.mutate({ ...ids, hidden: false }) }
        : { id: 'hide', label: 'Hide', icon: EyeOff, tone: 'neutral', run: leaving(() => hide.mutate({ ...ids, hidden: true })) },
    )
    if (session.capabilities.archive) live.push({ id: 'archive', label: 'Archive', icon: Archive, tone: 'neutral', run: () => setDialog('archive') })
    if (session.capabilities.terminate) live.push({ id: 'stop', label: 'Stop', icon: Power, tone: 'danger', run: () => setDialog('stop') })
    return live
  }

  return (
    <>
      {children(actions)}
      {dialog === 'rename' ? <RenameDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === 'place' ? <PlaceDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === 'archive' ? <ArchiveDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} /> : null}
      {dialog === 'stop' ? (
        <StopDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} onDone={leaving(() => {})} />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteDialog daemonId={daemonId} session={session} onClose={() => setDialog(null)} onDone={leaving(() => {})} />
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

interface Mutation {
  mutate: (variables: undefined, options: { onSuccess: () => void }) => void
  isPending: boolean
  error: Error | null
}

/** Asks before something that cannot be undone, then runs it: `onDone` after it worked. */
function ConfirmDialog({
  title,
  description,
  confirm,
  mutation,
  onClose,
  onDone,
}: {
  title: string
  description: string
  confirm: ReactNode
  mutation: Mutation
  onClose: () => void
  onDone?: () => void
}) {
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent title={title} description={description}>
        {mutation.error ? <Banner tone="error">{mutation.error.message}</Banner> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(undefined, {
                onSuccess: () => {
                  onClose()
                  onDone?.()
                },
              })
            }
          >
            {confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface DialogProps {
  daemonId: string
  session: Session
  onClose: () => void
  onDone?: () => void
}

function StopDialog({ daemonId, session, ...rest }: DialogProps) {
  return (
    <ConfirmDialog
      title={`Stop ${session.name}?`}
      description="This ends the agent and kills its tmux session."
      confirm={
        <>
          <Power /> Stop
        </>
      }
      mutation={useTerminateSession(daemonId, session.id)}
      {...rest}
    />
  )
}

/** What archiving does here: where the session runs decides what ends. */
function archiveEffect(session: Session): string {
  const kept = 'Its conversation stays readable under Archived.'
  const codex = session.runtime === 'codex'
  // a Codex pane that is also a thread of Codex's shared app-server keeps its thread: only the pane closes
  if (session.tmux_pane && session.remote_id && !codex) return `This ends the agent, closes its tmux pane and archives it on Remote Control. ${kept}`
  if (session.tmux_pane) return `This ends the agent and closes its tmux pane. ${kept}`
  if (codex) return `This archives the thread in Codex, which ends it. ${kept}`
  return `This archives it on Remote Control, which ends the agent. ${kept}`
}

function ArchiveDialog({ daemonId, session, ...rest }: DialogProps) {
  return (
    <ConfirmDialog
      title={`Archive ${session.name}?`}
      description={archiveEffect(session)}
      confirm={
        <>
          <Archive /> Archive
        </>
      }
      mutation={useArchiveSession(daemonId, session.id)}
      {...rest}
    />
  )
}

function DeleteDialog({ daemonId, session, ...rest }: DialogProps) {
  return (
    <ConfirmDialog
      title={`Delete ${session.name}?`}
      description="It leaves the archive, and its conversation is no longer shown here."
      confirm={
        <>
          <Trash2 /> Delete
        </>
      }
      mutation={useTerminateSession(daemonId, session.id)}
      {...rest}
    />
  )
}
