import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PendingAction } from '@/lib/api/types'
import { useApprove, useDeny } from '../api/use-approval'
import { text } from '@/components/ui/styles'

/** For a list row: approve with the usual choice, or deny, without opening the session. Only when there
 *  is a usual choice (permission prompts); a question needs the session open. */
export function QuickApproval({ daemonId, sessionId, pending }: { daemonId: string; sessionId: string; pending: PendingAction }) {
  const approve = useApprove(daemonId, sessionId)
  const deny = useDeny(daemonId, sessionId)
  const choice = pending.options?.find((o) => o.key === pending.recommended)
  if (!choice) return null
  const busy = approve.isPending || deny.isPending
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="approve" disabled={busy} onClick={() => approve.mutate(choice.key)} className="max-w-full">
        <Check /> <span className="truncate">{choice.label}</span>
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => deny.mutate()}>
        <X /> Deny
      </Button>
      {(approve.error ?? deny.error) ? (
        <span className={text({ size: 'xs', tone: 'danger' })}>{(approve.error ?? deny.error)!.message}</span>
      ) : null}
    </div>
  )
}
