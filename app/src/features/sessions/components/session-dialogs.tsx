import { Archive, EyeOff, Power, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { Session } from '@/lib/api/types'
import { useArchiveSession, useTerminateSession } from '../api/use-session-mutations'
import { useHideSession } from '../api/use-session-marks'

/** The confirmations of a session's actions (`session-actions.tsx`). */
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

export interface DialogProps {
  daemonId: string
  session: Session
  onClose: () => void
  onDone?: () => void
}

export function StopDialog({ daemonId, session, ...rest }: DialogProps) {
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
  if (session.tmux_pane && session.remote_id && !codex)
    return `This ends the agent, closes its tmux pane and archives it on Remote Control. ${kept}`
  if (session.tmux_pane) return `This ends the agent and closes its tmux pane. ${kept}`
  if (codex) return `This archives the thread in Codex, which ends it. ${kept}`
  return `This archives it on Remote Control, which ends the agent. ${kept}`
}

export function ArchiveDialog({ daemonId, session, ...rest }: DialogProps) {
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

/** Where a session muxtower cannot end runs (`capabilities.archive_ends` false: Claude's desktop app). */
const runsIn = (session: Session) => (session.origin === 'claude_desktop' ? "Claude's desktop app" : 'a Claude Code muxtower does not run')

/** Archive, for a session muxtower cannot end: says so, and hides it here instead. */
export function HideInsteadDialog({ daemonId, session, ...rest }: DialogProps) {
  const hide = useHideSession()
  const mutation: Mutation = {
    mutate: (_, options) => hide.mutate({ daemonId, sessionId: session.id, hidden: true }, options),
    isPending: hide.isPending,
    error: hide.error,
  }
  return (
    <ConfirmDialog
      title={`Hide ${session.name}?`}
      description={`It runs in ${runsIn(session)}, which muxtower cannot end: it stays there, and may go on working. Here it can only be hidden; to end it, archive it there.`}
      confirm={
        <>
          <EyeOff /> Hide
        </>
      }
      mutation={mutation}
      {...rest}
    />
  )
}

export function DeleteDialog({ daemonId, session, ...rest }: DialogProps) {
  return (
    <ConfirmDialog
      title={`Delete ${session.name}?`}
      description={
        session.interrupted_at
          ? 'It is not started again, and muxtower forgets it. Its conversation stays with its agent.'
          : 'It leaves the archive, and its conversation is no longer shown here.'
      }
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
