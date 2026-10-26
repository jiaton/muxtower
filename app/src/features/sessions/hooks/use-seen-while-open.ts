import { useEffect } from 'react'
import type { Session } from '@/lib/api/types'
import { useMarkRead } from '../api/use-session-marks'

const HEARTBEAT_MS = 30_000 // under the daemon's 45 s "someone is watching" window

/** While a session is on screen it is read: on opening, when it has news, and every half minute (so the
 *  daemon skips "done" notifications for it). Nothing is sent while the page is hidden, nor for an
 *  archived session (nothing happens in it any more). */
export function useSeenWhileOpen(daemonId: string, session: Session) {
  const { mutate } = useMarkRead()
  const { id, unread } = session
  const archived = Boolean(session.archived_at)

  useEffect(() => {
    if (archived) return
    const seen = () => {
      if (document.visibilityState === 'visible') mutate({ daemonId, sessionId: id, read: true })
    }
    seen()
    const timer = setInterval(seen, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', seen)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', seen)
    }
  }, [daemonId, id, archived, mutate])

  useEffect(() => {
    if (unread && document.visibilityState === 'visible') mutate({ daemonId, sessionId: id, read: true })
  }, [daemonId, id, unread, mutate])
}
