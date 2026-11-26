import type { ConversationItem, MediaRef, SharedFile } from '@/lib/api/types'
import { mediaKind, type MediaKind } from '@/lib/media'

/** One thing the conversation's gallery shows large, a picture or a video: a file an item names
 *  (`ConversationItem.media`, `from: 'file'`, by its path as written), an image inside a tool's result
 *  (`from: 'inline'`, by its item and place), one an agent shared (`ConversationItem.shared`), or, from a
 *  daemon too old to list `media`, an image by its absolute path (`ConversationItem.images`, `from: 'path'`).
 *  `key` is what a thumbnail opens it by. */
export type GalleryMedia = { key: string; kind: MediaKind; name: string; description?: string } & (
  | { from: 'path'; path: string }
  | { from: 'file'; path: string }
  | { from: 'inline'; seq: number; index: number }
  | { from: 'shared'; file: SharedFile }
)

const baseName = (path: string) => path.split('/').pop() ?? path

export const pathMedia = (path: string): GalleryMedia => ({
  key: path,
  from: 'path',
  path,
  kind: mediaKind(path) ?? 'image', // the daemon names only pictures (and videos) in `images`
  name: baseName(path),
  description: path,
})

/** A media reference of item `seq` as a gallery item; none for one the daemon sent half of. */
export function refMedia(seq: number, ref: MediaRef): GalleryMedia | null {
  const kind: MediaKind = ref.kind === 'video' ? 'video' : 'image'
  if (ref.source === 'file' && ref.path) return { key: `file:${ref.path}`, from: 'file', path: ref.path, kind, name: baseName(ref.path), description: ref.path }
  if (ref.source === 'inline' && typeof ref.index === 'number')
    return { key: `inline:${seq}:${ref.index}`, from: 'inline', seq, index: ref.index, kind, name: `Image ${ref.index + 1} of a tool's result` }
  return null
}

/** What an item shows under it: its `media`, or, from a daemon too old to send them, its `images`. */
export function itemMedia(item: ConversationItem): GalleryMedia[] {
  const refs = item.media ?? []
  if (refs.length) return refs.flatMap((ref) => refMedia(item.seq, ref) ?? [])
  return (item.images ?? []).map(pathMedia)
}

/** A shared file as a gallery item, if it is a picture or a video the browser shows. */
export function sharedMedia(file: SharedFile): GalleryMedia | null {
  const kind = mediaKind(file.name, file.media_type)
  return kind ? { key: `shared:${file.id}`, from: 'shared', file, kind, name: file.name, description: file.caption ?? undefined } : null
}

/** The daemon no longer keeps it (`expires_at` passed): the item stays, the file is gone. */
export const isExpired = (file: SharedFile, now = Date.now()) => Date.parse(file.expires_at) <= now

/** Every picture and video a conversation shows, in its order, each once: what its items show and the files
 *  its agent shared (not those already expired; those that cannot show go once known: `withoutKeys`). */
export function conversationMedia(items: ConversationItem[], now = Date.now()): GalleryMedia[] {
  const out = new Map<string, GalleryMedia>()
  for (const item of items) {
    for (const media of itemMedia(item)) if (!out.has(media.key)) out.set(media.key, media)
    if (item.kind === 'shared' && item.shared && !isExpired(item.shared, now)) {
      const media = sharedMedia(item.shared)
      if (media) out.set(media.key, media)
    }
  }
  return [...out.values()]
}

/** The gallery without what cannot show (`unshown`, by key: gone, too large, not media, its machine away):
 *  the viewer counts only what it can show. */
export function withoutKeys(media: GalleryMedia[], unshown: ReadonlySet<string>): GalleryMedia[] {
  return unshown.size ? media.filter((m) => !unshown.has(m.key)) : media
}

/** When a file was shared, as the conversation says it: the time today, else the day and the time. */
export function sharedWhen(iso: string, now = new Date()): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (at.toDateString() === now.toDateString()) return time
  return `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}
