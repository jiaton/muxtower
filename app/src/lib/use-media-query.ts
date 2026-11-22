import { useSyncExternalStore } from 'react'

interface Watched {
  subscribe: (onChange: () => void) => () => void
  matches: () => boolean
}
const watched = new Map<string, Watched>()
let source: typeof window.matchMedia | null = null // the lists come from this one (a test may swap it)

/** One MediaQueryList per query, shared by every component asking it, with a subscribe and a read that
 *  stay the same: a render neither builds a list nor subscribes again (a menu per row asks one each). */
function watch(query: string): Watched {
  if (window.matchMedia !== source) {
    source = window.matchMedia
    watched.clear()
  }
  let found = watched.get(query)
  if (!found) {
    const list = window.matchMedia(query)
    found = {
      subscribe: (onChange) => {
        list.addEventListener('change', onChange)
        return () => list.removeEventListener('change', onChange)
      },
      matches: () => list.matches,
    }
    watched.set(query, found)
  }
  return found
}

const NONE: Watched = { subscribe: () => () => {}, matches: () => false }
const never = () => false

/** Whether a CSS media query matches, kept current (e.g. which panes the layout shows side by side). */
export function useMediaQuery(query: string): boolean {
  // Where nothing answers media queries (a test's DOM, an old embedded browser), none matches.
  const can = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const it = can ? watch(query) : NONE
  return useSyncExternalStore(it.subscribe, it.matches, never)
}

/** The breakpoint from which the list and a session show side by side (Tailwind `md`). */
export const SPLIT_QUERY = '(min-width: 48rem)'

/** The breakpoint from which the sidebar is docked (Tailwind `lg`); below it, it is a drawer. */
export const SIDEBAR_QUERY = '(min-width: 64rem)'

/** Below Tailwind `sm`: a phone held upright. */
export const PHONE_QUERY = '(max-width: 39.99rem)'
