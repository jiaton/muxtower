import type { UseQueryResult } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Loading } from '@/components/ui/skeleton'

/**
 * The one shared loading/error/empty pattern for server-state queries (see app/AGENTS.md). Loading shows
 * nothing at first (a quick load never flashes), then `skeleton`, the caller's placeholder in the shape of
 * what comes (else one quiet line). An error is a banner; for a whole page (`page`), a centred notice with
 * Retry.
 */
export function QueryState<T>({
  query,
  empty,
  isEmpty,
  skeleton,
  page = false,
  children,
}: {
  query: UseQueryResult<T>
  empty?: ReactNode
  isEmpty?: (data: T) => boolean
  skeleton?: ReactNode
  page?: boolean
  children: (data: T) => ReactNode
}) {
  if (query.isPending && query.fetchStatus === 'idle') return null // disabled, not loading
  if (query.isPending) return <Loading>{skeleton}</Loading>
  if (query.isError)
    return page ? (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState icon={<CircleAlert />} title="Couldn't load this">
          <div className="flex flex-col items-center gap-3">
            <p>{query.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? 'Retrying…' : 'Retry'}
            </Button>
          </div>
        </EmptyState>
      </div>
    ) : (
      <Banner tone="error">{query.error.message}</Banner>
    )
  if (isEmpty?.(query.data)) return <>{empty}</>
  return <>{children(query.data)}</>
}
