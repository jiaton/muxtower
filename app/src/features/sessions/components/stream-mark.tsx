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

/** How this page hears from a daemon, said only when it is not as it should be: nothing while updates are
 *  pushed as they happen (the usual), a small dot with what it means otherwise: reconnecting (it asks every
 *  few seconds meanwhile), behind a sign-in page, or offline. Beside a session's state, a dot for the usual
 *  read as a second state. */
export function StreamMark({ daemonId, className }: { daemonId: string; className?: string }) {
  const status = useStreamStatus((s) => s.status[daemonId])
  const online = useSyncExternalStore(subscribe, isOnline, () => true)
  if (online && status === 'open') return null
  const [label, tone] = !online
    ? ['Offline: no network, this page is not updating', 'bg-fg-muted/50']
    : status === 'blocked'
      ? ['Behind a sign-in page: updates checked once a minute', 'bg-state-permission']
      : ['Reconnecting: updates every few seconds meanwhile', 'bg-state-permission']
  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-flex size-4 shrink-0 items-center justify-center', className)}>
      <span className={cn('size-1.5 rounded-full', tone, online && 'animate-pulse')} />
    </span>
  )
}
