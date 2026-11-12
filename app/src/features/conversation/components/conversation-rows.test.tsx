import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { mergeItems } from '@/lib/api/conversation'
import type { ConversationItem } from '@/lib/api/types'
import { ConversationView } from './conversation-view'

const drawn = vi.hoisted(() => ({ count: 0 }))
vi.mock('@/components/ui/markdown', () => ({
  Markdown: ({ children }: { children: string }) => {
    drawn.count += 1
    return <div>{children}</div>
  },
}))

it('draws only the new row when a long conversation gets one more item', () => {
  let items: ConversationItem[] = []
  for (let seq = 1; seq <= 300; seq++) items = mergeItems(items, [{ seq, kind: 'reply', text: `Reply number ${seq}.` }])
  const source = { daemonId: 'd1', sessionId: 's1' }
  const { rerender } = render(<ConversationView items={items} source={source} />)
  expect(drawn.count).toBe(300)
  drawn.count = 0
  items = mergeItems(items, [{ seq: 301, kind: 'reply', text: 'One more.' }])
  rerender(<ConversationView items={items} source={{ ...source }} />) // a new but equal source object
  expect(drawn.count).toBe(1)
})
