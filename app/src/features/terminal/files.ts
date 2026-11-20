/** Files attached to a message (anything but the pictures a session takes as images): uploaded as soon as
 *  they are added, then named in the message by id (`SendInput.attachments`). */
import { MAX_IMAGES } from './images'

/** As many as pictures: the schema's limit for each. */
export const MAX_FILES = MAX_IMAGES
/** The daemon's size limit when its refusal does not say (its default `attachments.max_mb`). */
export const DEFAULT_MAX_MB = 25

/** A file's name cut in the middle: `head` may be cut short (an ellipsis), `tail` always shows, so the
 *  extension and the last few letters before it stay readable. */
export function splitName(name: string, keep = 6): { head: string; tail: string } {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : ''
  const stem = name.slice(0, name.length - ext.length)
  if (stem.length <= keep + 2) return { head: '', tail: name }
  return { head: stem.slice(0, stem.length - keep), tail: stem.slice(stem.length - keep) + ext }
}

/** A size in the units people read: 512 B, 14 KB, 3.2 MB. */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const kb = bytes / 1000
  if (kb < 1000) return `${Math.round(kb)} KB`
  const mb = kb / 1000
  return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, '') : Math.round(mb)} MB`
}

/** Why an upload failed, in plain words: over the size limit (413, the limit the daemon gave, else the
 *  default), refused with its reason (409), anything else as the daemon said it. */
export function uploadErrorText(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (status === 413) {
    const given = (body as { max_mb?: unknown } | null)?.max_mb
    const fromText = typeof detail === 'string' ? /(\d+(?:\.\d+)?)\s*MB/i.exec(detail)?.[1] : undefined
    const limit = typeof given === 'number' ? given : fromText ? Number(fromText) : DEFAULT_MAX_MB
    return `Too large: over ${limit} MB`
  }
  if (typeof detail === 'string' && detail) return detail
  return `Upload refused (${status})`
}
