import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_IMAGES, shrink, type Attachment } from '../images'

/** The pictures attached to the message being written, up to MAX_IMAGES. Each preview's object URL is
 *  revoked when it is removed, sent or the box goes. */
export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const live = useRef(items)
  live.current = items
  useEffect(() => () => live.current.forEach((a) => URL.revokeObjectURL(a.preview)), [])

  const add = useCallback(async (files: File[]) => {
    setError(null)
    const room = MAX_IMAGES - live.current.length
    if (files.length > room) setError(`Up to ${MAX_IMAGES} pictures in a message.`)
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        const { blob, type } = await shrink(file)
        const item = { id: crypto.randomUUID(), blob, type, preview: URL.createObjectURL(blob) }
        setItems((now) => (now.length < MAX_IMAGES ? [...now, item] : (URL.revokeObjectURL(item.preview), now)))
      } catch {
        setError('Could not read that picture.')
      }
    }
  }, [])

  const remove = useCallback((id: string) => {
    setItems((now) => {
      now.filter((a) => a.id === id).forEach((a) => URL.revokeObjectURL(a.preview))
      return now.filter((a) => a.id !== id)
    })
  }, [])

  /** Hands the pictures over for sending and empties the box (their previews go). */
  const take = useCallback(() => {
    const taken = live.current
    taken.forEach((a) => URL.revokeObjectURL(a.preview))
    setItems([])
    return taken
  }, [])

  /** Puts pictures that could not be sent back (with new previews). */
  const restore = useCallback((back: Attachment[]) => {
    setItems((now) => [...back.map((a) => ({ ...a, preview: URL.createObjectURL(a.blob) })), ...now].slice(0, MAX_IMAGES))
  }, [])

  return { items, error, add, remove, take, restore }
}
