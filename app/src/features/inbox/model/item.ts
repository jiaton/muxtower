import type { InboxItem } from '@/lib/api/types'

/** A project an item can be for: its name and colour (`--color-project-N`, null: none yet). */
export interface InboxProject {
  name: string
  hue: number | null
}

/** What the Inbox needs from the rest of the app, composed by the route: the projects (in the owner's
 *  order) and a session's name by its id (a handed item names who got it). */
export interface InboxDirectory {
  projects: InboxProject[]
  sessionName: (id: string) => string | undefined
}

/** The sidebar's count: what is still the owner's to do something with (a handed one is its taker's now). */
export const openCount = (items: readonly InboxItem[]) => items.filter((i) => i.status === 'open').length

/** To whom a handed item went: the role it was handed to, else the session by name. */
export function handedTo(item: InboxItem, sessionName: InboxDirectory['sessionName']): string | null {
  const h = item.handed
  if (!h) return null
  return h.to_role || sessionName(h.to_session) || h.to_session
}
