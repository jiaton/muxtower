import type { ConversationItem } from './types'

/** The newest items a conversation keeps here, as the daemon does: a session left open for hours does not
 *  grow without end (each one rendered, and kept, for as long as the tab is open). */
export const MAX_ITEMS = 400

/** Conversation items are keyed by `seq`; a changed item (a tool finishing, a prompt answered) arrives
 *  again with the same seq and replaces the old one. Items that did not change stay the same objects (so a
 *  row of one is not drawn again). Only the newest `MAX_ITEMS` are kept. */
export function mergeItems(shown: ConversationItem[] | undefined, incoming: ConversationItem[]): ConversationItem[] {
  const bySeq = new Map((shown ?? []).map((item) => [item.seq, item]))
  for (const item of incoming) bySeq.set(item.seq, item)
  const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq)
  return merged.length > MAX_ITEMS ? merged.slice(-MAX_ITEMS) : merged
}
