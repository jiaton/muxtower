/** A file's name and size as the app shows them: on an attachment's chip, on a shared file's card. */

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
