import type { ConversationItem } from './types'

/** Conversation items are keyed by `seq`; a changed item (a tool finishing, a prompt answered) arrives
 *  again with the same seq and replaces the old one. */
export function mergeItems(shown: ConversationItem[] | undefined, incoming: ConversationItem[]): ConversationItem[] {
  const bySeq = new Map((shown ?? []).map((item) => [item.seq, item]))
  for (const item of incoming) bySeq.set(item.seq, item)
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}
