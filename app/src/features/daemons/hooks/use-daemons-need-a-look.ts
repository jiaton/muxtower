import { useAllSessions } from '@/features/sessions/api/use-sessions'
import { useDaemonProblems } from '@/features/sessions/components/daemon-alerts'
import { usePairedDaemons } from '@/lib/daemons/store'
import { useNodes } from '@/lib/daemons/use-nodes'

/** Why the Daemons page wants a look, if it does: a daemon that cannot be reached or no longer accepts
 *  this device, or a node with an update waiting. Null when all is well. With no tab bar to it, the sidebar's
 *  button and its Daemons entry carry a dot instead. */
export function useDaemonsNeedALook(): string | null {
  const problems = useDaemonProblems(useAllSessions())
  const hub = usePairedDaemons()[0]
  const outdated = (useNodes(hub?.id ?? '', !!hub).data ?? []).filter((n) => n.update)
  if (problems.rejected.length) return `${problems.rejected[0]!.name} no longer accepts this device`
  if (problems.hubsDown.length) return `${problems.hubsDown[0]!.name} is unreachable`
  if (problems.blocked.length) return `${problems.blocked[0]!.daemon.name} is behind a sign-in page`
  if (problems.failing.length) return `${problems.failing[0]!.daemon.name} is unreachable`
  if (outdated.length) return `${outdated.map((n) => n.name).join(', ')}: an update is waiting`
  return null
}
