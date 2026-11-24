import { Link } from '@tanstack/react-router'
import { ink } from '@/components/ui/intents'
import { usePairedDaemons } from '@/lib/daemons/store'
import { usePlaybook } from '../api/use-playbook'
import { scopeOf } from '../model/playbook'

/** The last line of a project's Team dialog: which playbook its sessions read ("Playbook: shared · Edit"),
 *  and where to edit it (the hub's settings, opened on this project). Nothing from a daemon too old to keep
 *  one. */
export function ProjectPlaybookLine({ project }: { project: string }) {
  const hub = usePairedDaemons()[0]
  const playbook = usePlaybook(hub?.id)
  const data = playbook.data
  if (!hub || !data) return null
  const own = data.projects.find((p) => p.scope === scopeOf(project))
  const which = own ? (own.mode === 'replace' ? 'its own' : 'shared + its own') : data.shared.text.trim() ? 'shared' : 'none yet'
  return (
    <p className={ink.meta}>
      Playbook: {which} ·{' '}
      <Link to="/daemons/$daemonId/settings" params={{ daemonId: hub.id }} search={{ playbook: project }} className={ink.link}>
        Edit
      </Link>
    </p>
  )
}
