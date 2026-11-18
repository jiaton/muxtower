import { Check, Send, X } from 'lucide-react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { Clamp } from '@/components/ui/clamp'
import type { PendingAction } from '@/lib/api/types'
import { useAnswer, useApprove, useDeny } from '../api/use-approval'
import { QuestionForm } from './question-form'

import { ink, look } from '@/components/ui/intents'

/** What the agent is waiting for and Deny (Esc). A question the agent's hook told (AskUserQuestion) is
 *  answered from what it asked: its options' text, descriptions and mockups are never read off the screen,
 *  which draws them side by side with other things. Anything else is one button per choice on screen. */
export function PendingActionCard({ daemonId, sessionId, pending }: { daemonId: string; sessionId: string; pending: PendingAction }) {
  const approve = useApprove(daemonId, sessionId)
  const answer = useAnswer(daemonId, sessionId)
  const deny = useDeny(daemonId, sessionId)
  const busy = approve.isPending || answer.isPending || deny.isPending
  const error = approve.error ?? answer.error ?? deny.error
  const options = pending.options ?? []
  if (pending.kind === 'peer_message')
    return <PeerMessage pending={pending} busy={busy} error={error} pick={(key) => approve.mutate(key)} />

  return (
    <div className="flex flex-col gap-3">
      {pending.tool_name || pending.detail ? (
        <div className="flex flex-col gap-1">
          {pending.tool_name ? <p className={ink.eyebrow}>{pending.tool_name}</p> : null}
          {pending.detail ? (
            <pre className={`${look.panel} ${ink.codeBody} max-h-40 overflow-auto px-3 py-2 whitespace-pre-wrap`}>{pending.detail}</pre>
          ) : null}
        </div>
      ) : null}
      {pending.questions?.length ? (
        <QuestionForm questions={pending.questions!} busy={busy} onSubmit={(answers) => answer.mutate(answers)} />
      ) : options.length ? (
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <Button
              key={option.key}
              variant={option.key === pending.recommended ? 'approve' : 'outline'}
              className="h-auto min-h-10 justify-start py-2 text-left whitespace-normal"
              disabled={busy}
              onClick={() => approve.mutate(option.key)}
            >
              {option.key === pending.recommended ? <Check /> : null}
              {option.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className={ink.hint}>Waiting for the choices to appear on screen…</p>
      )}
      <Button variant="ghost" className="self-start" disabled={busy} onClick={() => deny.mutate()}>
        <X /> Deny (Esc)
      </Button>
      {error ? <Banner tone="error">{error.message}</Banner> : null}
    </div>
  )
}

/** A message from another agent session that Claude Code holds for the owner: who sent it, what it says,
 *  and its own two choices, Deliver and Deny. Neither is a default: nothing delivers it by accident. */
function PeerMessage({
  pending,
  busy,
  error,
  pick,
}: {
  pending: PendingAction
  busy: boolean
  error: Error | null
  pick: (key: string) => void
}) {
  const options = pending.options ?? []
  const deliver = options.find((o) => /^Deliver\b/i.test(o.label))
  const deny = options.find((o) => /^Deny\b/i.test(o.label))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className={ink.eyebrow}>Message from {pending.sender ?? 'another session'}</p>
        {pending.detail ? (
          <div className={`${look.panel} ${ink.body} px-3 py-2 whitespace-pre-wrap`}>
            <Clamp>{pending.detail}</Clamp>
          </div>
        ) : null}
      </div>
      {deliver && deny ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => pick(deliver.key)}>
            <Send /> Deliver
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => pick(deny.key)}>
            <X /> Deny
          </Button>
        </div>
      ) : (
        <p className={ink.hint}>Waiting for the choices to appear on screen…</p>
      )}
      {error ? <Banner tone="error">{error.message}</Banner> : null}
    </div>
  )
}
