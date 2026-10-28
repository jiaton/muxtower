import { create } from 'zustand'
import type { ConversationItem } from './api/types'
import { randomId } from './id'

/** How long a sent message waits to show up in its conversation before it is said to be unconfirmed. */
export const CONFIRM_MS = 60_000

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
}

/** What a waiting message looks like: on its way, sent and waiting for the conversation, or waited for
 *  too long. */
export type OutgoingState = 'sending' | 'waiting' | 'unconfirmed'

export interface ShownOutgoing extends Outgoing {
  state: OutgoingState
}

interface Outbox {
  /** Per session (`daemonId/sessionId`, as drafts are keyed), in the order sent. Not persisted: a
   *  reload shows the conversation as the daemon has it. */
  sent: Record<string, Outgoing[]>
  add: (key: string, text: string, afterSeq: number) => string
  settle: (key: string, id: string) => void
  /** Marks messages confirmed (by the prompt that did); once every one is, the session's are dropped. */
  confirm: (key: string, seqs: Map<string, number>) => void
  remove: (key: string, ids: string[]) => void
}

export const useOutbox = create<Outbox>()((set) => ({
  sent: {},
  add: (key, text, afterSeq) => {
    const id = randomId()
    const entry: Outgoing = { id, text, sentAt: Date.now(), afterSeq, sending: true }
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

const normal = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

export const newestSeq = (items: ConversationItem[] | undefined) => (items ?? []).reduce((max, i) => Math.max(max, i.seq), -1)

/** Which sent messages, not confirmed yet, the conversation now has, and by which prompt: one after the
 *  message's `afterSeq` with its text (spacing aside), each prompt confirming one message; then a later
 *  prompt worded otherwise (an agent that records it its own way) confirms the oldest message still
 *  waiting before it. A prompt that confirmed a message already confirms no other. */
export function confirmed(sent: Outgoing[], items: ConversationItem[]): Map<string, number> {
  const prompts = items.filter((i) => i.kind === 'prompt')
  const used = new Set(sent.flatMap((m) => (m.seq === undefined ? [] : [m.seq])))
  const done = new Map<string, number>()
  const open = sent.filter((m) => m.seq === undefined)
  for (const message of open) {
    const text = normal(message.text)
    const match = prompts.find((p) => p.seq > message.afterSeq && !used.has(p.seq) && normal(p.text) === text)
    if (match) {
      used.add(match.seq)
      done.set(message.id, match.seq)
    }
  }
  for (const prompt of prompts) {
    if (used.has(prompt.seq)) continue
    const oldest = open.find((m) => !done.has(m.id) && !m.sending && prompt.seq > m.afterSeq)
    if (oldest) {
      used.add(prompt.seq)
      done.set(oldest.id, prompt.seq)
    }
  }
  return done
}

export const stateOf = (message: Outgoing, now: number): OutgoingState =>
  message.sending ? 'sending' : now - message.sentAt >= CONFIRM_MS ? 'unconfirmed' : 'waiting'
