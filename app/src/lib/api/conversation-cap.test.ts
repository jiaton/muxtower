import { expect, it } from 'vitest'
import { MAX_ITEMS, mergeItems } from './conversation'
import type { ConversationItem } from './types'

const reply = (seq: number): ConversationItem => ({ seq, kind: 'reply', text: `reply ${seq}` })

it('keeps the newest items only, however long a session stays open, and unchanged items as they were', () => {
  let shown: ConversationItem[] = []
  for (let seq = 1; seq <= 3000; seq++) shown = mergeItems(shown, [reply(seq)])
  expect(shown).toHaveLength(MAX_ITEMS)
  expect(shown[0]!.seq).toBe(3000 - MAX_ITEMS + 1)
  const before = shown[10]
  const next = mergeItems(shown, [{ ...reply(3000), text: 'changed' }])
  expect(next[10]).toBe(before) // the same object: its row is not drawn again
  expect(next.at(-1)!.text).toBe('changed')
})
