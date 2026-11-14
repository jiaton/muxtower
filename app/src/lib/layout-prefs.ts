import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SIDEBAR_QUERY, SPLIT_QUERY, useMediaQuery } from './use-media-query'
import { mergeWithDefaults } from './persist-merge'

/**
 * Which panes stand beside an open session, per browser: the sidebar (from `lg`) and the session list
 * (from `md`). A hidden one is a drawer over the session instead, as on a phone (never resizing it, so a
 * terminal keeps its size). Focus mode is both hidden: the session takes the full width. The list hides
 * only beside a session: with none open it is the page.
 */
interface LayoutPrefs {
  sidebar: boolean
  list: boolean
  setSidebar: (shown: boolean) => void
  setList: (shown: boolean) => void
  /** Both away, or (when both already are) both back. */
  toggleFocus: () => void
}

export const useLayoutPrefs = create<LayoutPrefs>()(
  persist(
    (set) => ({
      sidebar: true,
      list: true,
      setSidebar: (sidebar) => set({ sidebar }),
      setList: (list) => set({ list }),
      toggleFocus: () => set((s) => (s.sidebar || s.list ? { sidebar: false, list: false } : { sidebar: true, list: true })),
    }),
    { name: 'muxtower.layout', version: 1, merge: mergeWithDefaults },
  ),
)

/** Whether the sidebar is docked: wide enough, and not hidden. */
export function useSidebarDocked() {
  return useMediaQuery(SIDEBAR_QUERY) && useLayoutPrefs((s) => s.sidebar)
}

/** Whether the list stands beside an open session: wide enough, and not hidden. */
export function useListBeside() {
  return useMediaQuery(SPLIT_QUERY) && useLayoutPrefs((s) => s.list)
}

/** Whether this screen could show the list beside a session at all (focus mode means something here). */
export function useCanSplit() {
  return useMediaQuery(SPLIT_QUERY)
}

/** Alt+F (Option+F), from anywhere on the page, like Live's Alt+L: focus mode on or off. By the key's
 *  position (`code`), so Option's character on a Mac is never typed; never with Ctrl or Cmd. */
export function useFocusShortcut(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== 'KeyF') return
      e.preventDefault()
      useLayoutPrefs.getState().toggleFocus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

/** The browser's full screen, where it has one (not every browser does: a car's may not). */
export const canFullScreen = () => typeof document !== 'undefined' && document.fullscreenEnabled === true

export function toggleFullScreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  else void document.documentElement.requestFullscreen().catch(() => {})
}
