import { expect, it } from 'vitest'
import type { ConversationItem, SharedFile } from '@/lib/api/types'
import { conversationMedia, isExpired, sharedWhen } from './gallery'

const NOW = Date.parse('2026-11-26T08:00:00Z')
const file = (id: string, name: string, media_type: string, expires_at = '2026-12-03T08:00:00Z'): SharedFile => ({
  id,
  name,
  media_type,
  size: 1000,
  caption: null,
  shared_at: '2026-11-26T07:30:00Z',
  expires_at,
})
const shared = (seq: number, f: SharedFile) => ({ seq, kind: 'shared', shared: f, images: [] }) as unknown as ConversationItem
const reply = (seq: number, images: string[]) => ({ seq, kind: 'reply', images }) as unknown as ConversationItem

it('lists pictures and videos by path and shared ones in order, each once, without expired or other files', () => {
  const items = [
    reply(1, ['/tmp/a.png']),
    shared(2, file('f1', 'clip.mp4', 'video/mp4')),
    shared(3, file('f2', 'notes.pdf', 'application/pdf')),
    shared(4, file('f3', 'old.png', 'image/png', '2026-11-20T00:00:00Z')),
    reply(5, ['/tmp/a.png', '/tmp/b.webm']),
  ]
  expect(conversationMedia(items, NOW).map((m) => [m.key, m.kind])).toEqual([
    ['/tmp/a.png', 'image'],
    ['shared:f1', 'video'],
    ['/tmp/b.webm', 'video'],
  ])
})

it('a shared file expires at its expires_at', () => {
  expect(isExpired(file('f', 'a.png', 'image/png', '2026-11-26T08:00:00Z'), NOW)).toBe(true)
  expect(isExpired(file('f', 'a.png', 'image/png', '2026-11-26T08:00:01Z'), NOW)).toBe(false)
})

it('says the time a file was shared today, and the day too before that', () => {
  const now = new Date(2026, 10, 26, 9, 0)
  expect(sharedWhen(new Date(2026, 10, 26, 7, 30).toISOString(), now)).not.toMatch(/Nov/)
  expect(sharedWhen(new Date(2026, 10, 24, 7, 30).toISOString(), now)).toMatch(/Nov 24/)
})
