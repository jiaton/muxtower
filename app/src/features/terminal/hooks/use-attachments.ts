import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_IMAGES, shrink, type Attachment } from '../images'

/** Lets the browser paint (a placeholder) before the work that follows. */
const painted = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

/** The pictures attached to the message being written, up to MAX_IMAGES, and how many are still being
 *  made small (`pending`: shown as placeholders at once, a large photo takes a moment). Each preview's
 *  object URL is revoked when it is removed, sent or the box goes. */
export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const live = useRef(items)
  live.current = items
  const reserved = useRef(0) // pending, as add() counts it before React renders
  useEffect(() => () => live.current.forEach((a) => URL.revokeObjectURL(a.preview)), [])

  const add = useCallback(async (files: File[]) => {
    setError(null)
    const room = Math.max(0, MAX_IMAGES - live.current.length - reserved.current)
    if (files.length > room) setError(`Up to ${MAX_IMAGES} pictures in a message.`)
    const taken = files.slice(0, room)
    reserved.current += taken.length
    setPending(reserved.current)
    for (const file of taken) {
      try {
        await painted()
        const { blob, type } = await shrink(file)
        const item = { id: crypto.randomUUID(), blob, type, preview: URL.createObjectURL(blob) }
        setItems((now) => (now.length < MAX_IMAGES ? [...now, item] : (URL.revokeObjectURL(item.preview), now)))
      } catch {
        setError('Could not read that picture.')
      } finally {
        reserved.current -= 1
        setPending(reserved.current)
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

  return { items, pending, error, add, remove, take, restore }
}
