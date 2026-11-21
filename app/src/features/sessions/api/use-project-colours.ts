import { useMutation, useQuery, useQueryClient, type Query } from '@tanstack/react-query'
import { createDaemonClient, unwrap } from '@/lib/api/client'
import { usePairedDaemons } from '@/lib/daemons/store'
import { daemonKey } from '@/lib/query'

/** Each project's hue (1 to 6, `--color-project-N`), by name as the list groups it. */
export type ProjectHues = Readonly<Record<string, number>>

const NONE: ProjectHues = {}

/** The daemon that keeps the colours: the first one this device talks to (the hub; while it is down, a node
 *  of it, which asks the hub), as for the project order. */
function useKeeper() {
  return usePairedDaemons()[0] ?? null
}

const keyOf = (id: string) => daemonKey(id, 'project-colours')

/** How soon to ask again: within a minute for another device's pick; sooner while `name` has no hue yet (the
 *  hub gives it one as it lists the project's first session, so the next answer has it). Not after a failure:
 *  a hub too old to keep colours stays without them. */
const askAgain = (name: string | undefined) => (query: Query<ProjectHues, Error, ProjectHues, readonly unknown[]>) =>
  name !== undefined && query.state.data && !(name in query.state.data) ? 10_000 : 60_000

function useHueQuery<T>(select: (hues: ProjectHues) => T, waitingFor?: string) {
  const keeper = useKeeper()
  return useQuery({
    queryKey: keyOf(keeper?.id ?? '-'),
    enabled: keeper !== null,
    retry: false,
    refetchInterval: askAgain(waitingFor),
    queryFn: async (): Promise<ProjectHues> => unwrap(await createDaemonClient(keeper!).GET('/v1/project-colours')).hues,
    select,
  })
}

const all = (hues: ProjectHues) => hues

/** Every project's hue, kept on the hub and the same on every device; none from a daemon too old to keep
 *  them (404, or a node whose hub is: 503), so every project shows neutral. */
export function useProjectColours(): ProjectHues {
  return useHueQuery(all).data ?? NONE
}

/** A project's hue, or null: none stored yet (it shows neutral, never a guess), or no project. */
export function useProjectHue(name: string | null | undefined): number | null {
  const hue = useHueQuery((hues) => (name ? (hues[name] ?? null) : null), name ?? undefined).data
  return hue ?? null
}

/** Gives a project the hue the owner picked, shown everywhere at once (and put back if the hub refuses it). */
export function useSaveProjectColour() {
  const keeper = useKeeper()
  const client = useQueryClient()
  const key = keyOf(keeper?.id ?? '-')
  return useMutation({
    mutationFn: async ({ project, hue }: { project: string; hue: number }) => {
      if (!keeper) throw new Error('No daemon to keep the colours')
      return unwrap(await createDaemonClient(keeper).PUT('/v1/project-colours', { body: { project, hue } })).hues
    },
    onMutate: async ({ project, hue }) => {
      await client.cancelQueries({ queryKey: key })
      const before = client.getQueryData<ProjectHues>(key)
      client.setQueryData<ProjectHues>(key, { ...before, [project]: hue })
      return { before }
    },
    onError: (_, __, context) => client.setQueryData(key, context?.before),
    onSuccess: (hues) => client.setQueryData(key, hues),
  })
}
