import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api/client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A rejected token or a missing route will not fix itself on retry.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 3,
      refetchOnWindowFocus: true,
    },
  },
})

/** Every daemon-scoped query key starts with this prefix (see app/AGENTS.md). */
export const daemonKey = (daemonId: string, ...rest: unknown[]) => ['daemon', daemonId, ...rest] as const
