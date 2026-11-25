import { useMemo } from 'react'
import { useProjectColours } from '@/features/sessions/api/use-project-colours'
import { useProjectOrder } from '@/features/sessions/api/use-project-order'
import { useSessionEntries } from '@/features/sessions/hooks/use-session-entries'
import { facetsOf } from '@/features/sessions/model/counts'
import { inProjectOrder } from '@/features/sessions/model/project-order'
import type { InboxDirectory } from '@/features/inbox/model/item'

/** What the Inbox needs to know of the sessions, composed here from the sessions feature: the projects an item
 *  can be for (those with sessions, in the owner's order, then the others the hub has a colour for, by
 *  name), each with its colour; and a session's name by its id. */
export function useInboxDirectory(): InboxDirectory {
  const { entries } = useSessionEntries()
  const hues = useProjectColours()
  const order = useProjectOrder()
  return useMemo(() => {
    const listed = inProjectOrder(facetsOf(entries).projects, (p) => p.label, order).map((p) => p.label)
    const others = Object.keys(hues)
      .filter((name) => !listed.includes(name))
      .sort()
    const names = new Map(entries.map((e) => [e.session.id, e.session.name]))
    return {
      projects: [...listed, ...others].map((name) => ({ name, hue: hues[name] ?? null })),
      sessionName: (id) => names.get(id),
    }
  }, [entries, hues, order])
}
