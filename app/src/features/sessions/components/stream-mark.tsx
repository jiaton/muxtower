import { useSyncExternalStore } from 'react'
import { useStreamStatus } from '@/lib/api/streams'
import { cn } from '@/lib/cn'
import { Dot } from '@/components/ui/indicators'

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
    ? ['Offline: no network, this page is not updating', 'muted' as const]
    : status === 'blocked'
      ? ['Behind a sign-in page: updates checked once a minute', 'warning' as const]
      : ['Reconnecting: updates every few seconds meanwhile', 'warning' as const]
  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-flex size-4 shrink-0 items-center justify-center', className)}>
      <Dot tone={tone} pulse={online} className="size-1.5" />
    </span>
  )
}
