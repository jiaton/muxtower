import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { PaneHeader } from '@/components/ui/pane'
import { projectLabel, workingIn } from '../model/places'
import type { Session } from '@/lib/api/types'
import { useSession } from '../api/use-sessions'
import { NO_ENVIRONMENT, agentOf, deviceOf, folderOf, roleShown, sourceOf } from '../model/facets'
import { agentIcon } from './agent-mark'
import { StateBadge } from './state-badge'
import { StreamMark } from './stream-mark'
import { ink } from '@/components/ui/intents'

/** The top of a session page: what opens the panes the layout hides (`leading`, from the page), name and
 *  state, which agent it is and where it runs (and, for a side chat or a fork, the session it came from,
 *  one tap away), and the page's actions. */
export function SessionHeader({
  daemonId,
  session,
  leading,
  actions,
}: {
  daemonId: string
  session: Session
  leading?: ReactNode
  actions?: ReactNode
}) {
  const parent = useSession(daemonId, session.fork_of ?? '').session
  const agent = agentOf(session)
  const AgentIcon = agentIcon(agent)
  const project = projectLabel(session)
  const role = roleShown(session)
  const team = role ? `${role}${project ? ` in ${project}` : ''}` : project
  const where = [
    team,
    agent,
    deviceOf(session) ?? NO_ENVIRONMENT,
    folderOf(session),
    workingIn(session),
    session.permission_mode ? `${session.permission_mode} mode` : null,
    sourceOf(session),
  ].filter(Boolean)
  return (
    <PaneHeader
      leading={leading}
      title={
        <>
          <h1 className="min-w-0 truncate">{session.name}</h1>
          {session.interrupted_at ? (
            <Badge>Interrupted</Badge>
          ) : session.archived_at ? (
            <Badge>Archived</Badge>
          ) : session.offline ? (
            <Badge>Offline</Badge>
          ) : (
            <StateBadge state={session.state} />
          )}
          <StreamMark daemonId={daemonId} />
        </>
      }
      subtitle={
        <span title={session.cwd || undefined}>
          {session.fork_of ? (
            <>
              <Link to="/d/$daemonId/s/$sessionId" params={{ daemonId, sessionId: session.fork_of }} search={true} className={ink.accent}>
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
