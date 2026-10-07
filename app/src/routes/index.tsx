import { Link, createFileRoute } from '@tanstack/react-router'
import { BellOff, CircleAlert, Server } from 'lucide-react'
import { Banner } from '@/components/ui/banner'
import { EmptyState } from '@/components/ui/empty-state'
import { PendingActionCard } from '@/features/approval/components/pending-action-card'
import { useAllSessions } from '@/features/sessions/api/use-sessions'
import { NewSessionDialog } from '@/features/sessions/components/new-session-dialog'
import { SessionRow } from '@/features/sessions/components/session-row'
import { useUnpairedDaemons } from '@/lib/daemons/store'

export const Route = createFileRoute('/')({ component: InboxPage })

function InboxPage() {
  const all = useAllSessions()
  const unpaired = useUnpairedDaemons()
  const waiting = all.flatMap(({ daemon, sessions }) =>
    sessions.filter((s) => s.needs_attention).map((session) => ({ daemon, session })),
  )
  const others = all.map(({ daemon, sessions }) => ({ daemon, sessions: sessions.filter((s) => !s.needs_attention) }))
  const multi = all.length > 1

  if (!all.length)
    return (
      <EmptyState icon={<Server />} title={unpaired.length ? 'Pair this device to get started' : 'No daemons yet'}>
        Run <code className="font-mono">muxtower pair</code> on the machine where your agents run, then{' '}
        <Link to="/daemons" className="text-accent underline">
          add it here
        </Link>
        .
      </EmptyState>
    )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <NewSessionDialog />
      </div>

      {all
        .filter((d) => d.error)
        .map(({ daemon, error }) => (
          <Banner key={daemon.id} tone="error">
            <CircleAlert />
            <span>
              {daemon.name}: {error!.message}
            </span>
          </Banner>
        ))}

      <section aria-labelledby="waiting" className="flex flex-col gap-3">
        <h2 id="waiting" className="text-sm font-medium text-fg-muted">
          Needs you
        </h2>
        {waiting.length ? (
          waiting.map(({ daemon, session }) => (
            <div key={`${daemon.id}:${session.id}`} className="flex flex-col gap-1">
              {multi ? <p className="text-xs text-fg-muted">{daemon.name}</p> : null}
              <SessionRow daemonId={daemon.id} session={session}>
                {session.pending ? (
                  <PendingActionCard daemonId={daemon.id} sessionId={session.id} pending={session.pending} />
                ) : null}
              </SessionRow>
            </div>
          ))
        ) : (
          <EmptyState icon={<BellOff />} title="Nothing needs you right now" />
        )}
      </section>

      {others.map(({ daemon, sessions }) =>
        sessions.length ? (
          <section key={daemon.id} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-fg-muted">{multi ? daemon.name : 'Other sessions'}</h2>
            {sessions.map((session) => (
              <SessionRow key={session.id} daemonId={daemon.id} session={session} />
            ))}
          </section>
        ) : null,
      )}
    </div>
  )
}
