import { expect, it } from 'vitest'
import type { ConversationItem, SharedFile } from '@/lib/api/types'
import { conversationMedia, isExpired, itemMedia, sharedWhen, withoutKeys } from './gallery'

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

it('leaves out a shared file the daemon answered 404 for before its time', () => {
  const items = [shared(1, file('a', 'a.png', 'image/png')), shared(2, file('b', 'b.png', 'image/png')), reply(3, ['/tmp/c.png'])]
  const media = conversationMedia(items, NOW)
  expect(withoutKeys(media, new Set(['shared:b'])).map((m) => m.key)).toEqual(['shared:a', '/tmp/c.png'])
  expect(withoutKeys(media, new Set())).toBe(media)
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

const withMedia = (seq: number, media: unknown[], images: string[] = []) => ({ seq, kind: 'reply', images, media }) as unknown as ConversationItem

it("shows an item's media: files by their path as written, a tool's inline images by item and place", () => {
  const item = withMedia(7, [
    { source: 'file', kind: 'image', path: '~/shots/home.png' },
    { source: 'inline', kind: 'image', index: 0, media_type: 'image/png' },
    { source: 'file', kind: 'video', path: 'demo/flow.webm' },
    { source: 'inline', kind: 'image' }, // half a reference: left out
  ])
  expect(itemMedia(item).map((m) => [m.key, m.kind, m.name])).toEqual([
    ['file:~/shots/home.png', 'image', 'home.png'],
    ['inline:7:0', 'image', "Image 1 of a tool's result"],
    ['file:demo/flow.webm', 'video', 'flow.webm'],
  ])
})

it("falls back to an old daemon's images when an item has no media, and lists each file once", () => {
  expect(itemMedia(withMedia(1, [], ['/tmp/a.png'])).map((m) => [m.key, m.from])).toEqual([['/tmp/a.png', 'path']])
  const twice = [withMedia(1, [{ source: 'file', kind: 'image', path: 'a.png' }]), withMedia(2, [{ source: 'file', kind: 'image', path: 'a.png' }])]
  expect(conversationMedia(twice, NOW).map((m) => m.key)).toEqual(['file:a.png'])
})
