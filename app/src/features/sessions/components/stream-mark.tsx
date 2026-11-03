import { useSyncExternalStore } from 'react'
import { useStreamStatus } from '@/lib/api/streams'
import { cn } from '@/lib/cn'

const subscribe = (changed: () => void) => {
  addEventListener('online', changed)
  addEventListener('offline', changed)
  return () => {
    removeEventListener('online', changed)
    removeEventListener('offline', changed)
  }
}
const isOnline = () => navigator.onLine

/** How this page hears from a daemon, as a small dot: live (pushed as it happens), polling (the live
 *  connection is down, so it asks every few seconds), or offline (no network). */
export function StreamMark({ daemonId, className }: { daemonId: string; className?: string }) {
  const status = useStreamStatus((s) => s.status[daemonId])
  const online = useSyncExternalStore(subscribe, isOnline, () => true)
  const [label, tone] = !online
    ? ['Offline: no network', 'bg-fg-muted/50']
    : status === 'open'
      ? ['Live: updates arrive as they happen', 'bg-success']
      : status === 'blocked'
        ? ['Behind a sign-in page: checking once a minute', 'bg-state-permission']
        : ['Polling: the live connection is down, reconnecting', 'bg-state-permission']
  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-flex size-4 shrink-0 items-center justify-center', className)}>
      <span className={cn('size-1.5 rounded-full', tone, status !== 'open' && online && 'animate-pulse')} />
    </span>
  )
}
