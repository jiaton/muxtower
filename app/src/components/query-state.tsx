import type { UseQueryResult } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Banner } from '@/components/ui/banner'

/** The one shared loading/error/empty pattern for server-state queries (see app/AGENTS.md). */
export function QueryState<T>({
  query,
  empty,
  isEmpty,
  children,
}: {
  query: UseQueryResult<T>
  empty?: ReactNode
  isEmpty?: (data: T) => boolean
  children: (data: T) => ReactNode
}) {
  if (query.isPending && query.fetchStatus === 'idle') return null // disabled, not loading
  if (query.isPending)
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    )
  if (query.isError) return <Banner tone="error">{query.error.message}</Banner>
  if (isEmpty?.(query.data)) return <>{empty}</>
  return <>{children(query.data)}</>
}
