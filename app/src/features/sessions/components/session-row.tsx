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
          <p className="truncate text-xs text-fg-muted">
            {[session.machine && `@${session.machine}`, session.origin?.replace('_', ' '), session.cwd || null]
              .filter(Boolean)
              .join(' · ') || session.runtime}
          </p>
          {session.summary?.detail || session.summary?.recent ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-fg">{session.summary.needs || session.summary.detail || session.summary.recent}</p>
          ) : null}
        </div>
        <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
      </Link>
      {children ? <div className="border-t border-border px-4 py-3">{children}</div> : null}
    </div>
  )
}
