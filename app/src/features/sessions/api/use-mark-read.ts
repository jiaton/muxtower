import { useMutation, useQueryClient } from '@tanstack/react-query'
import { check, createDaemonClient } from '@/lib/api/client'
import type { Session } from '@/lib/api/types'
import { useDaemonsStore } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'

export interface MarkRead {
  daemonId: string
  sessionId: string
  /** False: unread, to come back to. */
  read: boolean
}

/** Tells a session's daemon the owner looked at it, or wants to come back to it. The cached list shows it
 *  at once; every other device hears it through the daemon's stream. Takes any daemon, so one mutation
 *  can mark a whole list read. */
export function useMarkRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ daemonId, sessionId, read }: MarkRead) => {
      const daemon = useDaemonsStore.getState().daemons.find((d) => d.id === daemonId)
      if (!daemon?.token || daemon.rejected) return
      const client = createDaemonClient({ url: daemon.url, token: daemon.token })
      check(await client.POST('/v1/sessions/{session_id}/read', { params: { path: { session_id: sessionId } }, body: { read } }))
    },
    onMutate: ({ daemonId, sessionId, read }) =>
      queryClient.setQueryData<Session[]>(daemonKey(daemonId, 'sessions'), (list) =>
        list?.some((s) => s.id === sessionId && s.unread === read)
          ? list.map((s) => (s.id === sessionId ? { ...s, unread: !read } : s))
          : list,
      ),
  })
}
