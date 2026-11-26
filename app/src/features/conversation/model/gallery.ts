import type { ConversationItem, SharedFile } from '@/lib/api/types'
import { mediaKind, type MediaKind } from '@/lib/media'

/** One thing the conversation's gallery shows large: a picture or video by its path on the session's
 *  machine (`ConversationItem.images`), or one an agent shared (`ConversationItem.shared`). `key` is what
 *  a thumbnail opens it by. */
export type GalleryMedia = { key: string; kind: MediaKind; name: string; description?: string } & (
  { from: 'path'; path: string } | { from: 'shared'; file: SharedFile }
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

/** A shared file as a gallery item, if it is a picture or a video the browser shows. */
export function sharedMedia(file: SharedFile): GalleryMedia | null {
  const kind = mediaKind(file.name, file.media_type)
  return kind ? { key: `shared:${file.id}`, from: 'shared', file, kind, name: file.name, description: file.caption ?? undefined } : null
}

/** The daemon no longer keeps it (`expires_at` passed): the item stays, the file is gone. */
export const isExpired = (file: SharedFile, now = Date.now()) => Date.parse(file.expires_at) <= now

/** Every picture and video a conversation shows, in its order, each once: what its items show by path and
 *  the files its agent shared (not those already expired; those the daemon answers 404 for go once known:
 *  `withoutGone`). */
export function conversationMedia(items: ConversationItem[], now = Date.now()): GalleryMedia[] {
  const out = new Map<string, GalleryMedia>()
  for (const item of items) {
    for (const path of item.images ?? []) if (!out.has(path)) out.set(path, pathMedia(path))
    if (item.kind === 'shared' && item.shared && !isExpired(item.shared, now)) {
      const media = sharedMedia(item.shared)
      if (media) out.set(media.key, media)
    }
  }
  return [...out.values()]
}

/** The gallery without the shared files the daemon answered 404 for (`gone`, by id): pruned before their
 *  time, they no longer count. */
export function withoutGone(media: GalleryMedia[], gone: ReadonlySet<string>): GalleryMedia[] {
  return gone.size ? media.filter((m) => m.from !== 'shared' || !gone.has(m.file.id)) : media
}

/** When a file was shared, as the conversation says it: the time today, else the day and the time. */
export function sharedWhen(iso: string, now = new Date()): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (at.toDateString() === now.toDateString()) return time
  return `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}
