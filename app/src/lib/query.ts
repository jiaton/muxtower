import { QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError } from './api/client'
import { markBlocked } from './api/stream-status'
import { markRejected } from './daemons/store'

export const queryClient = new QueryClient({
  // Any daemon query answered with 401 means this device's token is gone: stop using that daemon.
  queryCache: new QueryCache({
    onError: (error, query) => {
      const [scope, daemonId] = query.queryKey
      if (!(error instanceof ApiError) || scope !== 'daemon' || typeof daemonId !== 'string') return
      if (error.tokenRejected) markRejected(daemonId)
      else if (error.blockedByGate) markBlocked(daemonId)
    },
  }),
  defaultOptions: {
    queries: {
      // A rejected token or a missing route will not fix itself on retry.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 3,
      // A gate in front that wants a sign-in will not change its mind every few seconds.
      refetchOnWindowFocus: true,
    },
  },
})

/** Every daemon-scoped query key starts with this prefix (see app/AGENTS.md). */
export const daemonKey = (daemonId: string, ...rest: unknown[]) => ['daemon', daemonId, ...rest] as const
