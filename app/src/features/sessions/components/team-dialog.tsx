import { useMemo, type ReactNode } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ink, look } from '@/components/ui/intents'
import { ProjectIcon } from '@/components/ui/project-hue'
import type { Session } from '@/lib/api/types'
import { ProjectPlaybookLine } from '@/features/playbook/components/project-playbook-line'
import { useProjectHue } from '../api/use-project-colours'
import { useUpdateTeam } from '../api/use-team'
import { useSessionEntries } from '../hooks/use-session-entries'
import { compareInProject } from '../model/project-order'
import { TeamMembers } from './team-members'
import { RecentTasks } from './team-tasks'
import { SaveState, ThisSession } from './team-this-session'

/** A section's small title, with what goes on its right (the save state). */
function SectionHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center gap-2">
      <h3 className={`${ink.eyebrow} min-w-0 flex-1`}>{title}</h3>
      {children}
    </div>
  )
}

/** A project's live sessions on a daemon, in the list's order (who leads first), and every session's name
 *  there by id (a task names archived ones too). */
function useTeam(daemonId: string, project: string | null | undefined) {
  const { entries } = useSessionEntries()
  return useMemo(() => {
    const here = entries.filter((e) => e.daemon.id === daemonId)
    const members = project
      ? here
          .filter((e) => e.session.project === project && !e.session.archived_at)
          .sort(compareInProject)
          .map((e) => e.session)
      : []
    return { members, names: new Map(here.map((e) => [e.session.id, e.session.name])) }
  }, [entries, daemonId, project])
}

/** The team part: its members (a click opens one and closes the dialog), then what they sent each other. */
function TeamSection({
  daemonId,
  project,
  current,
  onClose,
}: {
  daemonId: string
  project: string
  current?: string
  onClose: () => void
}) {
  const { members, names } = useTeam(daemonId, project)
  return (
    <section aria-label="Team" className="flex flex-col gap-3">
      <SectionHead title="Team" />
      <TeamMembers daemonId={daemonId} members={members} current={current} onOpen={onClose} />
      <RecentTasks daemonId={daemonId} project={project} names={names} />
    </section>
  )
}

function TeamFrame({
  project,
  subtitle,
  onClose,
  children,
}: {
  project: string | null | undefined
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  const hue = useProjectHue(project)
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        title={project ? `Team · ${project}` : 'Team'}
        titleIcon={project ? <ProjectIcon hue={hue} className="size-4" /> : null}
        description={subtitle}
        className="sm:max-w-xl"
      >
        {children}
        {project ? (
          <div className={`${look.rule.top} pt-3`}>
            <ProjectPlaybookLine project={project} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/**
 * A session's team, titled by its project (with the project's colour), the session's name under it: "This
 * session" (its role, project and note, each saved as it is left) apart from "Team" (the project's members,
 * then what they sent each other lately); the playbook in a line at the bottom. A bottom sheet on a phone.
 * Agents set the same through muxtower's MCP tools; this is the owner's say.
 */
export function TeamDialog({ daemonId, session, onClose }: { daemonId: string; session: Session; onClose: () => void }) {
  const update = useUpdateTeam(daemonId, session.id)
  const project = session.project
  return (
    <TeamFrame project={project} subtitle={session.name} onClose={onClose}>
      <section aria-label="This session" className="flex flex-col gap-2">
        <SectionHead title="This session">
          <SaveState update={update} />
        </SectionHead>
        <ThisSession session={session} update={update} />
      </section>
      <div className={`${look.rule.top} pt-3`}>
        {project ? (
          <TeamSection daemonId={daemonId} project={project} current={session.id} onClose={onClose} />
        ) : (
          <p className={ink.hint}>No project yet. Pick one above to join its team.</p>
        )}
      </div>
    </TeamFrame>
  )
}

/** A project's team, opened from its group in the list: the Team part alone. */
export function ProjectTeamDialog({ daemonId, project, onClose }: { daemonId: string; project: string; onClose: () => void }) {
  return (
    <TeamFrame project={project} onClose={onClose}>
      <TeamSection daemonId={daemonId} project={project} onClose={onClose} />
    </TeamFrame>
  )
}
