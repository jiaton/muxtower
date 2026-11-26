/** Files attached to a message (anything but the pictures a session takes as images): uploaded as soon as
 *  they are added, then named in the message by id (`SendInput.attachments`). */
import { MAX_IMAGES } from './images'

/** As many as pictures: the schema's limit for each. */
export const MAX_FILES = MAX_IMAGES
/** The daemon's size limit when its refusal does not say (its default `attachments.max_mb`). */
export const DEFAULT_MAX_MB = 25

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
