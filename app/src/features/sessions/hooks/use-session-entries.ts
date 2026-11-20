import { useMemo } from 'react'
import { useAllSessions } from '../api/use-sessions'
import { entryKey, type SessionEntry } from '../model/facets'

/** Every session of every paired daemon, flattened, plus each daemon's own result (for its errors). */
export function useSessionEntries() {
  const daemons = useAllSessions()
  const entries = useMemo<SessionEntry[]>(
    () => daemons.flatMap(({ daemon, sessions }) => sessions.map((session) => ({ key: entryKey(daemon.id, session.id), daemon, session }))),
    [daemons],
  )
  return { entries, daemons, loading: daemons.some((d) => d.isPending) }
}
