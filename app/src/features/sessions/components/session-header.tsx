import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { look } from '@/components/ui/intents'
import { PaneHeader } from '@/components/ui/pane'
import type { Session } from '@/lib/api/types'
import { ProjectTag } from '@/components/ui/project-hue'
import { useProjectHue } from '../api/use-project-colours'
import { headerTags } from '../model/details'
import { projectGroupOf } from '../model/facets'
import { SessionDetails } from './session-details'
import { StateBadge } from './state-badge'
import { StreamMark } from './stream-mark'

/** How each tag gives way on a narrow header: the project shrinks, down to a few letters; the role and
 *  the machine keep their width (each at most a few words, cut past that), and on a header narrower still
 *  the row of tags is cut at its end. The ⓘ, outside that row, always shows. */
const TAG_FIT = { role: 'max-w-28 shrink-0', project: 'min-w-10 shrink', machine: 'max-w-28 shrink-0' } as const

/** The top of a session page: what opens the panes the layout hides (`leading`, from the page), name and
 *  state; under them its role's name, project and machine as tags (one it lacks left out) and an ⓘ that
 *  opens every other fact about it (`SessionDetails`); and the page's actions. */
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
  const tags = headerTags(session)
  const grouped = projectGroupOf(session) // where it belongs, when a project (`belongs.ts`' first step): its colour's key
  const hue = useProjectHue(grouped)
  return (
    <PaneHeader
      component="session header"
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
            <StateBadge state={session.state} kind={session.needs_attention ? session.pending?.kind : null} />
          )}
          <StreamMark daemonId={daemonId} />
        </>
      }
      subtitle={
        <span className="flex min-w-0 items-center gap-1 pt-0.5">
          {tags.length ? (
            <span className="flex min-w-0 items-center gap-1 overflow-hidden">
              {tags.map((t) =>
                t.key === 'project' ? (
                  <ProjectTag
                    key={t.key}
                    data-tag={t.key}
                    title={t.title}
                    hue={t.text === grouped ? hue : null}
                    className={`${TAG_FIT[t.key]} truncate`}
                  >
                    {t.text}
                  </ProjectTag>
                ) : (
                  <span key={t.key} data-tag={t.key} title={t.title} className={`${look.tag} ${TAG_FIT[t.key]} truncate`}>
                    {t.text}
                  </span>
                ),
              )}
            </span>
          ) : null}
          <SessionDetails daemonId={daemonId} session={session} />
        </span>
      }
      actions={actions}
    />
  )
}
