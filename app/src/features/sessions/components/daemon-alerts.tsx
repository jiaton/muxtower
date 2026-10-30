import { Link } from '@tanstack/react-router'
import { CircleAlert } from 'lucide-react'
import { Banner } from '@/components/ui/banner'
import { useStreamStatus } from '@/lib/api/streams'
import { useRejectedDaemons } from '@/lib/daemons/store'
import type { DaemonSessions } from '../api/use-sessions'

/** Why some sessions may be missing: a daemon that revoked this device, one behind a sign-in page, one
 *  that does not answer. One per daemon; the others' sessions still show. */
export function DaemonAlerts({ daemons }: { daemons: DaemonSessions[] }) {
  const rejected = useRejectedDaemons()
  const status = useStreamStatus((s) => s.status)
  const blocked = daemons.filter((d) => status[d.daemon.id] === 'blocked')
  const failing = daemons.filter((d) => d.error && status[d.daemon.id] !== 'blocked')
  if (!rejected.length && !blocked.length && !failing.length) return null
  return (
    <div className="flex flex-col gap-2 p-3">
      {rejected.map((daemon) => (
        <Banner key={daemon.id} tone="error">
          <CircleAlert />
          <span>
            {daemon.name} no longer accepts this device.{' '}
            <Link to="/daemons" className="underline">
              Pair again
            </Link>
          </span>
        </Banner>
      ))}
      {blocked.map(({ daemon }) => (
        <Banner key={`blocked-${daemon.id}`} tone="warning">
          <CircleAlert />
          <span>
            {daemon.name} is behind a sign-in page.{' '}
            <a
              href={daemon.url}
              className="underline"
              target={new URL(daemon.url).origin === location.origin ? undefined : '_blank'}
              rel="noreferrer"
            >
              Open it and sign in
            </a>
            , then come back.
          </span>
        </Banner>
      ))}
      {failing.map(({ daemon, error }) => (
        <Banner key={daemon.id} tone="error">
          <CircleAlert />
          <span>
            {daemon.name}: {error!.message}
          </span>
        </Banner>
      ))}
    </div>
  )
}
