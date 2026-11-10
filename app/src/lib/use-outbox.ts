import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConversationItem } from './api/types'
import { CONFIRM_MS, GRACE_MS, confirmed, newestSeq, stateOf, useOutbox, type Outgoing, type ShownOutgoing } from './outbox'

const NONE: Outgoing[] = []

/** What a message box sends, told to the outbox: `sent` once its request went through, `failed` if it
 *  did not (it is then taken back out: its text goes back in the box). */
export type Track = (text: string) => { sent: () => void; failed: () => void }

/** The messages sent to a session that its conversation does not have yet, to show at its end, and
 *  `track` for its message box. A message the conversation has is dropped. One sent while the agent works
 *  (`working`) is queued: the agent takes it in at its next step. One the conversation still lacks a
 *  moment after the session stopped working did not go in (kept, with its text, to send again or put
 *  away); one it lacks after `CONFIRM_MS` while the agent works is shown as unconfirmed. */
export function useOutgoing(daemonId: string, sessionId: string, items: ConversationItem[] | undefined, working = false) {
  const key = `${daemonId}/${sessionId}`
  const sent = useOutbox((s) => s.sent[key]) ?? NONE
  const { add, settle, confirm, remove } = useOutbox.getState()
  const done = useMemo(() => confirmed(sent, items ?? []), [sent, items])
  const open = sent.filter((m) => m.seq === undefined && !done.has(m.id))
  const [now, setNow] = useState(() => Date.now())
  const [idleSince, setIdleSince] = useState<number | null>(() => (working ? null : Date.now()))
  const busy = useRef(working)
  busy.current = working

  // The conversation has them: they are its own items now.
  useEffect(() => {
    if (done.size) confirm(key, done)
  }, [done, key, confirm])

  useEffect(() => {
    setIdleSince(working ? null : Date.now())
    setNow(Date.now())
  }, [working])

  // Wake up when the next one is due to change: waited too long, or not gone in.
  const due = open
    .filter((m) => !m.sending)
    .flatMap((m) => {
      const state = stateOf(m, now, idleSince)
      if (state === 'undelivered') return []
      const times = idleSince === null ? [] : [Math.max(idleSince, m.sentAt) + GRACE_MS]
      return state === 'waiting' ? [...times, m.sentAt + CONFIRM_MS] : times
    })
  const next = due.length ? Math.min(...due) : null
  useEffect(() => {
    if (next === null) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, next - Date.now()))
    return () => clearTimeout(timer)
  }, [next])

  const pending: ShownOutgoing[] = open.map((m) => ({ ...m, state: stateOf(m, now, idleSince) }))
  const track = useCallback<Track>(
    (text) => {
      const id = add(key, text, newestSeq(items), busy.current)
      return { sent: () => settle(key, id), failed: () => remove(key, [id]) }
    },
    [add, key, items, remove, settle],
  )
  const dismiss = useCallback((id: string) => remove(key, [id]), [key, remove])
  return { pending, track: items ? track : undefined, dismiss }
}
