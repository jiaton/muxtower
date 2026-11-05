/** Where the app opens once the first session list is in: the one session that needs the owner, if
 *  there is exactly one; otherwise Home, with the cursor on the session last opened (or its machine). */
import type { Session } from '@/hub/types'
import { HOME, groupOf, isShown, needsYou, type Nav } from './model'

export function launchNav(nav: Nav, sessions: Session[], hubName: string): Nav {
  const waiting = needsYou(sessions)
  if (waiting.length === 1) {
    const id = waiting[0].id
    return { ...nav, stack: [HOME, { screen: 'session', id }], cursors: { ...nav.cursors, home: `s:${id}` }, lastOpened: id }
  }
  const last = sessions.find((s) => s.id === nav.lastOpened && isShown(s))
  if (!last) return { ...nav, stack: [HOME] }
  const home = needsYou([last]).length ? `s:${last.id}` : `g:${groupOf(last, hubName)}`
  return { ...nav, stack: [HOME], cursors: { ...nav.cursors, home } }
}
