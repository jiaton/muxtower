import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Session } from '@/lib/api/types'
import { StateBadge } from './state-badge'

/** One session: name, where it runs, state. `children` is an optional slot rendered under it (e.g. an
 *  approval card in the Inbox). */
export function SessionRow({ daemonId, session, children }: { daemonId: string; session: Session; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface shadow-card">
      <Link
        to="/d/$daemonId/s/$sessionId"
        params={{ daemonId, sessionId: session.id }}
        className="flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-surface-muted"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{session.name}</span>
            <StateBadge state={session.state} />
          </div>
          <p className="truncate font-mono text-xs text-fg-muted">
            {session.runtime} · {session.cwd}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
      </Link>
      {children ? <div className="border-t border-border px-4 py-3">{children}</div> : null}
    </div>
  )
}
