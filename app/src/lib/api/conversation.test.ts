import { expect, it } from 'vitest'
import { mergeItems } from './conversation'
import type { ConversationItem } from './types'

const item = (seq: number, status?: string): ConversationItem => ({ seq, kind: 'tool', status: status ?? null })

it('appends new items and replaces changed ones in order', () => {
  const merged = mergeItems([item(16, 'running'), item(32)], [item(16, 'done'), item(48)])
  expect(merged.map((i) => [i.seq, i.status])).toEqual([
    [16, 'done'],
    [32, null],
    [48, null],
  ])
})
