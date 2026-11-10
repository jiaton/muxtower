import { create } from 'zustand'
import type { ConversationItem } from './api/types'
import { randomId } from './id'

/** How long a sent message waits to show up in its conversation before it is said to be unconfirmed. */
export const CONFIRM_MS = 60_000
/** How long a message the conversation lacks may wait once the session stopped working, before it is said
 *  not to have gone in (its transcript is read every second or two). */
export const GRACE_MS = 10_000

/** A message sent to a session with a conversation, shown in it until the conversation has it.
 *  `afterSeq`: the newest item the conversation had when it was sent; only a later prompt confirms it. */
export interface Outgoing {
  id: string
  text: string
  sentAt: number
  afterSeq: number
  /** Its request is still on its way (after that, it waits for the conversation). */
  sending: boolean
  /** The prompt that confirmed it: it is the conversation's now, and that prompt confirms no other. */
  seq?: number
  /** Sent while the agent was working: it waits in the agent's queue, taken in at its next step. */
  queued?: boolean
}

/** What a waiting message looks like: on its way, in the agent's queue, sent and waiting for the
 *  conversation, waited for too long, or not taken in (the session stopped working without it). */
export type OutgoingState = 'sending' | 'queued' | 'waiting' | 'unconfirmed' | 'undelivered'

export interface ShownOutgoing extends Outgoing {
  state: OutgoingState
}

interface Outbox {
  /** Per session (`daemonId/sessionId`, as drafts are keyed), in the order sent. Not persisted: a
   *  reload shows the conversation as the daemon has it. */
  sent: Record<string, Outgoing[]>
  add: (key: string, text: string, afterSeq: number, queued?: boolean) => string
  settle: (key: string, id: string) => void
  /** Marks messages confirmed (by the prompt that did); once every one is, the session's are dropped. */
  confirm: (key: string, seqs: Map<string, number>) => void
  remove: (key: string, ids: string[]) => void
}

export const useOutbox = create<Outbox>()((set) => ({
  sent: {},
  add: (key, text, afterSeq, queued) => {
    const id = randomId()
    const entry: Outgoing = { id, text, sentAt: Date.now(), afterSeq, sending: true, ...(queued ? { queued } : {}) }
    set((s) => ({ sent: { ...s.sent, [key]: [...(s.sent[key] ?? []), entry] } }))
    return id
  },
  settle: (key, id) =>
    set((s) => ({ sent: { ...s.sent, [key]: (s.sent[key] ?? []).map((m) => (m.id === id ? { ...m, sending: false } : m)) } })),
  confirm: (key, seqs) =>
    set((s) => {
      const list = (s.sent[key] ?? []).map((m) => (seqs.has(m.id) ? { ...m, seq: seqs.get(m.id) } : m))
      const sent = { ...s.sent, [key]: list }
      // Nothing left waiting: a message sent from now on waits for a prompt after all of these anyway.
      if (list.every((m) => m.seq !== undefined)) delete sent[key]
      return { sent }
    }),
  remove: (key, ids) =>
    set((s) => {
      const left = (s.sent[key] ?? []).filter((m) => !ids.includes(m.id))
      const sent = { ...s.sent, [key]: left }
      if (left.every((m) => m.seq !== undefined)) delete sent[key] // nothing left waiting
      return { sent }
    }),
}))

// How a prompt may be recorded otherwise than typed: Claude Code wraps pasted text in tags (older versions
// kept only a placeholder for it), and spacing changes.
const PASTED = /<\/?pasted_content\b[^>]*>/g
const PLACEHOLDER = /\[(?:Pasted text|Image) #\d+[^\]]*\]/g
const keyOf = (text: string | null | undefined) => (text ?? '').replace(PASTED, '').replace(/\s+/g, '')
const same = (sent: string, recorded: string) => {
  const a = keyOf(sent)
  const b = keyOf(recorded)
  if (a === b) return true
  const bare = keyOf(recorded.replace(PASTED, '').replace(PLACEHOLDER, ''))
  // What was pasted, kept only as a placeholder: the rest of what it says must be in what was sent.
  return bare.length < b.length && a.includes(bare)
}

export const newestSeq = (items: ConversationItem[] | undefined) => (items ?? []).reduce((max, i) => Math.max(max, i.seq), -1)

/** Which sent messages, not confirmed yet, the conversation now has, and by which prompt. The agent takes
 *  what it is sent in order, so each prompt after a message was sent confirms the oldest message still
 *  waiting that it says (spacing, the tags around pasted text and placeholders for it aside). A prompt
 *  that says none of them was typed some other way (in the terminal): it confirms nothing. A prompt that
 *  confirmed a message confirms no other. */
export function confirmed(sent: Outgoing[], items: ConversationItem[]): Map<string, number> {
  const prompts = items.filter((i) => i.kind === 'prompt').sort((a, b) => a.seq - b.seq)
  const used = new Set(sent.flatMap((m) => (m.seq === undefined ? [] : [m.seq])))
  const done = new Map<string, number>()
  const open = sent.filter((m) => m.seq === undefined)
  for (const prompt of prompts) {
    if (used.has(prompt.seq)) continue
    const message = open.find((m) => !done.has(m.id) && prompt.seq > m.afterSeq && same(m.text, prompt.text ?? ''))
    if (message) {
      used.add(prompt.seq)
      done.set(message.id, prompt.seq)
    }
  }
  return done
}

/** `idleSince`: since when the session has not been working (null while it works). */
export const stateOf = (message: Outgoing, now: number, idleSince: number | null = null): OutgoingState => {
  if (message.sending) return 'sending'
  if (idleSince !== null && now - Math.max(idleSince, message.sentAt) >= GRACE_MS) return 'undelivered'
  if (message.queued) return 'queued'
  return now - message.sentAt >= CONFIRM_MS ? 'unconfirmed' : 'waiting'
}
