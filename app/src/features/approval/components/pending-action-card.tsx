import { Check, X } from 'lucide-react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import type { PendingAction } from '@/lib/api/types'
import { useAnswer, useApprove, useDeny } from '../api/use-approval'
import { QuestionForm, needsForm } from './question-form'

import { ink, look } from '@/components/ui/intents'

/** What the agent is waiting for, with one button per choice on screen (or, for several questions or
 *  one taking several answers, a form answering them all) and Deny (Esc). */
export function PendingActionCard({ daemonId, sessionId, pending }: { daemonId: string; sessionId: string; pending: PendingAction }) {
  const approve = useApprove(daemonId, sessionId)
  const answer = useAnswer(daemonId, sessionId)
  const deny = useDeny(daemonId, sessionId)
  const busy = approve.isPending || answer.isPending || deny.isPending
  const error = approve.error ?? answer.error ?? deny.error
  const options = pending.options ?? []

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
      {needsForm(pending.questions) ? (
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
