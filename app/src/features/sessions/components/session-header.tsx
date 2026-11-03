import { Link } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PaneHeader } from '@/components/ui/pane'
import type { Session } from '@/lib/api/types'
import { useSession } from '../api/use-sessions'
import { NO_ENVIRONMENT, agentOf, deviceOf, folderOf, sourceOf } from '../model/facets'
import { useSessionDrawer } from '../store'
import { agentIcon } from './agent-mark'
import { StateBadge } from './state-badge'
import { StreamMark } from './stream-mark'

/** The top of a session page: the list as a drawer (phones), name and state, which agent it is and where
 *  it runs (and, for a side chat or a fork, the session it came from, one tap away), and the page's
 *  actions. */
export function SessionHeader({ daemonId, session, actions }: { daemonId: string; session: Session; actions?: ReactNode }) {
  const parent = useSession(daemonId, session.fork_of ?? '').session
  const drawerOpen = useSessionDrawer((s) => s.open)
  const setDrawer = useSessionDrawer((s) => s.setOpen)
  const agent = agentOf(session)
  const AgentIcon = agentIcon(agent)
  const team = session.team_role ? `${session.team_role}${session.project ? ` in ${session.project}` : ''}` : null
  const where = [team, agent, deviceOf(session) ?? NO_ENVIRONMENT, folderOf(session), sourceOf(session)].filter(Boolean)
  return (
    <PaneHeader
      leading={
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-1 md:hidden"
          aria-label="Sessions"
          aria-expanded={drawerOpen}
          title="Sessions"
          onClick={() => setDrawer(true)}
        >
          <Menu />
        </Button>
      }
      title={
        <>
          <h1 className="min-w-0 truncate">{session.name}</h1>
          {session.archived_at ? <Badge>Archived</Badge> : session.offline ? <Badge>Offline</Badge> : <StateBadge state={session.state} />}
          <StreamMark daemonId={daemonId} />
        </>
      }
      subtitle={
        <span title={session.cwd || undefined}>
          {session.fork_of ? (
            <>
              <Link to="/d/$daemonId/s/$sessionId" params={{ daemonId, sessionId: session.fork_of }} search={true} className="text-accent">
                {session.side_chat ? 'Side chat' : 'Fork'} of {parent?.name ?? 'another session'}
              </Link>
              {' · '}
            </>
          ) : null}
          <AgentIcon aria-hidden className="mr-1 inline size-3 align-[-0.125em]" />
          {where.join(' · ')}
        </span>
      }
      actions={actions}
    />
  )
}
