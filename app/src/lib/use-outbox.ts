import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConversationItem } from './api/types'
import { CONFIRM_MS, confirmed, newestSeq, stateOf, useOutbox, type Outgoing, type ShownOutgoing } from './outbox'

const NONE: Outgoing[] = []

/** What a message box sends, told to the outbox: `sent` once its request went through, `failed` if it
 *  did not (it is then taken back out: its text goes back in the box). */
export type Track = (text: string) => { sent: () => void; failed: () => void }

/** The messages sent to a session that its conversation does not have yet, to show at its end, and
 *  `track` for its message box. A message the conversation has is dropped; one it still lacks after
 *  `CONFIRM_MS` is shown as unconfirmed (kept, with its text, until dismissed). */
export function useOutgoing(daemonId: string, sessionId: string, items: ConversationItem[] | undefined) {
  const key = `${daemonId}/${sessionId}`
  const sent = useOutbox((s) => s.sent[key]) ?? NONE
  const { add, settle, confirm, remove } = useOutbox.getState()
  const done = useMemo(() => confirmed(sent, items ?? []), [sent, items])
  const open = sent.filter((m) => m.seq === undefined && !done.has(m.id))
  const [now, setNow] = useState(() => Date.now())

  // The conversation has them: they are its own items now.
  useEffect(() => {
    if (done.size) confirm(key, done)
  }, [done, key, confirm])

  // Wake up when the next one has waited too long.
  const waiting = open.filter((m) => stateOf(m, now) === 'waiting')
  const next = waiting.length ? Math.min(...waiting.map((m) => m.sentAt)) : null
  useEffect(() => {
    if (next === null) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, next + CONFIRM_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [next])

  const pending: ShownOutgoing[] = open.map((m) => ({ ...m, state: stateOf(m, now) }))
  const track = useCallback<Track>(
    (text) => {
      const id = add(key, text, newestSeq(items))
      return { sent: () => settle(key, id), failed: () => remove(key, [id]) }
    },
    [add, key, items, remove, settle],
  )
  const dismiss = useCallback((id: string) => remove(key, [id]), [key, remove])
  return { pending, track: items ? track : undefined, dismiss }
}
