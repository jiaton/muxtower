import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/indicators'
import { ink } from '@/components/ui/intents'
import type { Continuation, Session } from '@/lib/api/types'
import { useContinueCheck, useContinueInTerminal } from '../api/use-continue'
import { deviceOf } from '../model/facets'

/** What a run is doing, said while it runs. */
export const PROGRESS: Partial<Record<Continuation['step'], string>> = {
  closing: 'Closing it in the Claude app…',
  starting: 'Starting it here…',
}

/** The button that runs it, by how the last run ended: a pane that did not start is started again. */
const runLabel = (last: Continuation | undefined) =>
  last?.step === 'failed' ? (last.retry ? 'Retry' : 'Try again') : 'Continue in terminal'

/** Continue in terminal, said first: it closes in the Claude app (everywhere on the account), then goes on in a
 *  terminal on its machine with its whole conversation, typed into as the owner. Why it cannot is said here
 *  (its transcript is looked for as it opens), then how far it got, and how it ended; once it runs in its
 *  pane, that session opens. */
export function ContinueDialog({ daemonId, session, onClose }: { daemonId: string; session: Session; onClose: () => void }) {
  const navigate = useNavigate()
  const run = useContinueInTerminal(daemonId, session.id)
  const check = useContinueCheck(daemonId, session.id, run.isPending)
  const where = deviceOf(session) ?? 'its machine'
  const now = check.data
  const last = run.data ?? (now?.step === 'failed' ? now : undefined)
  const blocked = now?.step === 'blocked' ? now.reason : null
  const progress = run.isPending ? (PROGRESS[now?.step ?? 'closing'] ?? PROGRESS.closing) : null

  const start = () =>
    run.mutate(undefined, {
      onSuccess: (result) => {
        if (result.step !== 'done' || !result.session_id) return
        onClose()
        void navigate({ to: '/d/$daemonId/s/$sessionId', params: { daemonId, sessionId: result.session_id }, search: true })
      },
    })

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && !run.isPending && onClose()}>
      <DialogContent title="Continue in terminal">
        <div className="flex flex-col gap-3">
          <p className={ink.body}>
            {session.name} closes in the Claude app (and on claude.ai and your phone), then goes on in a terminal on {where}, its whole
            conversation kept. muxtower then types into it as you: nothing waits for Deliver.
          </p>
          {check.isLoading ? <p className={ink.hint}>Looking for its conversation on {where}…</p> : null}
          {blocked ? <Banner tone="warning">{blocked}</Banner> : null}
          {progress ? (
            <p role="status" className="flex items-center gap-1.5">
              <Spinner />
              <span className={ink.body}>{progress}</span>
            </p>
          ) : null}
          {!run.isPending && last?.step === 'failed' ? <Banner tone="error">{last.reason}</Banner> : null}
          {!run.isPending && run.error ? <Banner tone="error">{run.error.message}</Banner> : null}
          <Button onClick={start} disabled={run.isPending || check.isLoading || Boolean(blocked)}>
            {runLabel(last)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Continue in terminal as a link by the message box's note of a Claude-app session (`composerNote`): it
 *  opens the dialog. Nothing where the daemon does not offer it. */
export function ContinueLink({ daemonId, session }: { daemonId: string; session: Session }) {
  const [open, setOpen] = useState(false)
  if (!session.capabilities.continue_terminal) return null
  return (
    <>
      <Button variant="link" size={null} onClick={() => setOpen(true)} title={session.continue_blocked ?? undefined}>
        Continue in terminal
      </Button>
      {open ? <ContinueDialog daemonId={daemonId} session={session} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
