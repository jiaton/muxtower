import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attachment } from '@/lib/api/types'
import { UploadError, useUploadAttachment } from '../api/use-upload-attachment'
import { MAX_FILES } from '../files'

export interface FileItem {
  key: string
  file: File
  status: 'uploading' | 'ready' | 'error'
  /** Bytes sent so far (uploading), of `file.size`. */
  sent: number
  /** What went wrong, in plain words (error). */
  error?: string
  /** It never got an answer: trying again may work. */
  retry?: boolean
  attachment?: Attachment
}

/** The files attached to the message being written (anything that is not sent as a picture), up to
 *  MAX_FILES. Each uploads as soon as it is added, its progress followed; one that fails says why and can
 *  be tried again (a network failure) or removed; it never holds the others back. */
export function useFiles(daemonId: string, sessionId: string) {
  const upload = useUploadAttachment(daemonId, sessionId)
  const [items, setItems] = useState<FileItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const live = useRef(items)
  live.current = items
  const running = useRef(new Map<string, AbortController>())
  useEffect(() => {
    const all = running.current
    return () => all.forEach((c) => c.abort())
  }, [])

  const patch = (key: string, change: Partial<FileItem>) =>
    setItems((now) => now.map((item) => (item.key === key ? { ...item, ...change } : item)))

  const start = useCallback(
    (key: string, file: File) => {
      const control = new AbortController()
      running.current.set(key, control)
      patch(key, { status: 'uploading', sent: 0, error: undefined, retry: undefined })
      upload(file, (sent) => patch(key, { sent }), control.signal).then(
        (attachment) => patch(key, { status: 'ready', sent: file.size, attachment }),
        (e: unknown) => {
          if (control.signal.aborted) return // removed: nothing to say
          const network = !(e instanceof UploadError) || e.kind === 'network'
          patch(key, { status: 'error', error: network ? 'Upload failed' : e.message, retry: network })
        },
      ).finally(() => {
        if (running.current.get(key) === control) running.current.delete(key)
      })
    },
    [upload],
  )

  const add = useCallback(
    (files: File[]) => {
      setNotice(null)
      if (!files.length) return
      const room = Math.max(0, MAX_FILES - live.current.length)
      const taken = files.slice(0, room)
      if (files.length > room)
        setNotice(`Up to ${MAX_FILES} files in a message: ${taken.length ? `added ${taken.length} of ${files.length}` : 'none added'}.`)
      const added = taken.map((file): FileItem => ({ key: crypto.randomUUID(), file, status: 'uploading', sent: 0 }))
      live.current = [...live.current, ...added]
      setItems(live.current)
      added.forEach((item) => start(item.key, item.file))
    },
    [start],
  )

  const retry = useCallback((key: string) => {
    const item = live.current.find((i) => i.key === key)
    if (item) start(key, item.file)
  }, [start])

  const remove = useCallback((key: string) => {
    running.current.get(key)?.abort()
    running.current.delete(key)
    setItems((now) => now.filter((i) => i.key !== key))
  }, [])

  /** Hands over what is ready to send and empties the box (a failed one goes too). */
  const take = useCallback(() => {
    const taken = live.current.filter((i) => i.status === 'ready')
    live.current.forEach((i) => running.current.get(i.key)?.abort())
    live.current = []
    setItems([])
    return taken
  }, [])

  /** Puts files whose message could not be sent back, ahead of any added since. */
  const restore = useCallback((back: FileItem[]) => {
    setItems((now) => [...back, ...now].slice(0, MAX_FILES))
  }, [])

  const uploading = items.filter((i) => i.status === 'uploading').length
  const ready = items.filter((i) => i.status === 'ready').length
  return { items, uploading, ready, notice, dismissNotice: () => setNotice(null), add, retry, remove, take, restore }
}
