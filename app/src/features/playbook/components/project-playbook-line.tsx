import { Link } from '@tanstack/react-router'
import { ink } from '@/components/ui/intents'
import { usePairedDaemons } from '@/lib/daemons/store'
import { usePlaybook } from '../api/use-playbook'
import { scopeOf } from '../model/playbook'

/** One line in a project's Team dialog: what its sessions read of the owner's playbook, and where to edit
 *  it (the hub's settings, opened on this project). Nothing from a daemon too old to keep one. */
export function ProjectPlaybookLine({ project }: { project: string }) {
  const hub = usePairedDaemons()[0]
  const playbook = usePlaybook(hub?.id)
  const data = playbook.data
  if (!hub || !data) return null
  const own = data.projects.find((p) => p.scope === scopeOf(project))
  const lines = (text: string) => text.trim().split('\n').filter(Boolean).length
  const said = own
    ? own.mode === 'replace'
      ? `its own, ${lines(own.text)} lines (replaces the shared one)`
      : `the shared one${data.shared.text.trim() ? '' : ' (empty)'}, plus ${lines(own.text)} lines of its own`
    : data.shared.text.trim()
      ? 'the shared one'
      : 'none yet'
  return (
    <p className={ink.meta}>
      Project playbook: {said} ·{' '}
      <Link to="/daemons/$daemonId/settings" params={{ daemonId: hub.id }} search={{ playbook: project }} className={ink.link}>
        edit
      </Link>
    </p>
  )
}
