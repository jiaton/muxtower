import { Link } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DetailItem, DetailList } from '@/components/ui/detail-list'
import { ink } from '@/components/ui/intents'
import { Popover } from '@/components/ui/popover'
import type { Session } from '@/lib/api/types'
import { useSession } from '../api/use-sessions'
import { sessionDetails } from '../model/details'
import { agentOf } from '../model/facets'
import { agentIcon } from './agent-mark'

/** The ⓘ at the end of a session header's tags: every fact about the session, as a popover (a sheet on a
 *  phone), each said the same way, paths and ids copyable; a side chat or a fork also links to the session
 *  it came from. */
export function SessionDetails({ daemonId, session }: { daemonId: string; session: Session }) {
  return (
    <Popover
      title="Session details"
      trigger={
        <Button variant="ghost" size="icon-xs" aria-label="Session details" title="Session details">
          <Info aria-hidden />
        </Button>
      }
    >
      <DetailsBody daemonId={daemonId} session={session} />
    </Popover>
  )
}

function DetailsBody({ daemonId, session }: { daemonId: string; session: Session }) {
  const parent = useSession(daemonId, session.fork_of ?? '').session
  const AgentIcon = agentIcon(agentOf(session))
  return (
    <DetailList>
      {session.fork_of ? (
        <DetailItem label={session.side_chat ? 'Side chat of' : 'Fork of'}>
          <Link to="/d/$daemonId/s/$sessionId" params={{ daemonId, sessionId: session.fork_of }} search={true} className={ink.link}>
            {parent?.name ?? 'another session'}
          </Link>
        </DetailItem>
      ) : null}
      {sessionDetails(session).map((d) => (
        <DetailItem key={d.label} label={d.label} code={d.code} copy={d.copy} copyLabel={`Copy the ${d.label.toLowerCase()}`}>
          {d.label === 'Agent' ? (
            <span className="inline-flex items-center gap-1.5">
              <AgentIcon aria-hidden className="size-3.5 shrink-0" />
              {d.value}
            </span>
          ) : (
            d.value
          )}
        </DetailItem>
      ))}
    </DetailList>
  )
}
