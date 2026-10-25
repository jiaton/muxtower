import { useSyncExternalStore } from 'react'

/** Whether a CSS media query matches, kept current (e.g. which panes the layout shows side by side). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** The breakpoint from which the list and a session show side by side (Tailwind `md`). */
export const SPLIT_QUERY = '(min-width: 48rem)'
