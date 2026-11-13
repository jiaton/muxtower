import { Link } from '@tanstack/react-router'
import { CircleAlert, Unplug } from 'lucide-react'
import { Banner } from '@/components/ui/banner'
import { ApiError } from '@/lib/api/client'
import { useStreamStatus } from '@/lib/api/streams'
import { whyUnreachable } from '@/lib/reach'
import { useFallback } from '@/lib/daemons/fallback'
import { useDaemonsStore, useRejectedDaemons } from '@/lib/daemons/store'
import type { DaemonSessions } from '../api/use-sessions'

import { TextLink } from '@/components/ui/text-link'
import { ink } from '@/components/ui/intents'

/** Why some sessions may be missing: a daemon that revoked this device, one behind a sign-in page, one
 *  that does not answer. One per daemon; the others' sessions still show. */
export function DaemonAlerts({ daemons }: { daemons: DaemonSessions[] }) {
  const rejected = useRejectedDaemons()
  const status = useStreamStatus((s) => s.status)
  const down = useFallback((f) => f.down)
  const all = useDaemonsStore((s) => s.daemons)
  const blocked = daemons.filter((d) => status[d.daemon.id] === 'blocked')
  const failing = daemons.filter((d) => d.error && status[d.daemon.id] !== 'blocked' && !(d.daemon.id in down))
  const hubsDown = all.filter((d) => d.id in down)
  if (!rejected.length && !blocked.length && !failing.length && !hubsDown.length) return null
  return (
    <div className="flex flex-col gap-2 p-3">
      {hubsDown.map((hub) => {
        const direct = all.filter((d) => d.via === hub.id).map((d) => d.name)
        return (
          <Banner key={`down-${hub.id}`} tone="warning">
            <Unplug />
            <span title="Push notifications come from the hub: none until it is back. Team changes wait for it too.">
              {hub.name} unreachable{direct.length ? ` · direct to ${direct.join(', ')}` : ''}. It switches back when {hub.name} answers
              again.
            </span>
          </Banner>
        )
      })}
      {rejected.map((daemon) => (
        <Banner key={daemon.id} tone="error">
          <CircleAlert />
          <span>
            {daemon.name} no longer accepts this device.{' '}
            <Link to="/daemons" className={ink.link}>
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
            <TextLink href={daemon.url} target={new URL(daemon.url).origin === location.origin ? undefined : '_blank'} rel="noreferrer">
              Open it and sign in
            </TextLink>
            , then come back.
          </span>
        </Banner>
      ))}
      {failing.map(({ daemon, error }) => (
        <Banner key={daemon.id} tone="error">
          <CircleAlert />
          <span>
            {daemon.name}: {error instanceof ApiError ? error!.message : whyUnreachable(daemon.url, error, location)}
          </span>
        </Banner>
      ))}
    </div>
  )
}
