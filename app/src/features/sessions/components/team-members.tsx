import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { StateDot } from '@/components/ui/indicators'
import { ink, look } from '@/components/ui/intents'
import type { AgentState, Session } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { deviceOf, roleNameOf } from '../model/facets'

/** A state in a word, as a teammate would ask "what is it doing?". */
const STATE_WORD: Record<AgentState, string> = {
  needs_permission: 'needs you',
  needs_trust: 'needs you',
  needs_answer: 'needs you',
  plan_review: 'needs you',
  error: 'error',
  busy: 'working',
  idle: 'idle',
  unknown: 'idle',
}

/** A project's sessions: state, name, role, machine and state in a word, `current` marked "this session".
 *  A click opens one (`onOpen` first, so the dialog closes). On a phone the machine goes under the name. */
export function TeamMembers({
  daemonId,
  members,
  current,
  onOpen,
}: {
  daemonId: string
  members: Session[]
  current?: string
  onOpen: () => void
}) {
  const navigate = useNavigate()
  return (
    <ul className="flex flex-col" aria-label="Members">
      {members.map((s) => {
        const role = roleNameOf(s)
        return (
          <li key={s.id}>
            <Button
              variant="plain"
              aria-current={s.id === current ? 'true' : undefined}
              onClick={() => {
                onOpen()
                void navigate({ to: '/d/$daemonId/s/$sessionId', params: { daemonId, sessionId: s.id }, search: true })
              }}
              className={cn(look.hoverRow, 'flex min-h-10 w-full min-w-0 items-center gap-2 px-2 py-1 text-left')}
            >
              <StateDot state={s.state} />
              <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`${ink.strong} min-w-0 truncate`}>{s.name}</span>
                  {role ? <span className={`${look.tag} shrink-0`}>{role}</span> : null}
                  {s.id === current ? <span className={`${ink.meta} shrink-0`}>this session</span> : null}
                </span>
                <span className={`${ink.meta} shrink-0 sm:ml-auto`}>{[deviceOf(s), STATE_WORD[s.state]].filter(Boolean).join(' · ')}</span>
              </span>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
