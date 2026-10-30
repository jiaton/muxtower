import { CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import type { Daemon } from '@/lib/daemons/types'
import { useExpiredLogins } from '../api/use-daemon-me'
import { ClaudeLoginDialog } from './claude-login-dialog'

/** Why sessions from Claude Desktop and the Claude app stopped updating: the Claude login on their daemon's
 *  machine expired. One per daemon, with a way to log in again from here. */
export function ExpiredLogins() {
  const expired = useExpiredLogins()
  // Kept while its dialog is open: the banner goes as soon as the new login works.
  const [loggingIn, setLoggingIn] = useState<Daemon | null>(null)
  if (!expired.length && !loggingIn) return null
  return (
    <div className="flex flex-col gap-2 p-3">
      {expired.map((daemon) => (
        <Banner key={daemon.id} tone="warning">
          <CircleAlert />
          <span className="flex-1">
            The Claude login on {daemon.name} expired: sessions from Claude Desktop and the Claude app stop updating until it is logged in
            again.
          </span>
          <Button size="sm" variant="outline" className="-my-1" onClick={() => setLoggingIn(daemon)}>
            Log in
          </Button>
        </Banner>
      ))}
      {loggingIn ? <ClaudeLoginDialog daemon={loggingIn} onClose={() => setLoggingIn(null)} /> : null}
    </div>
  )
}
