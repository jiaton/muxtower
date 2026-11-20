import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SIDEBAR_QUERY, SPLIT_QUERY, useMediaQuery } from './use-media-query'
import { mergeWithDefaults } from './persist-merge'

/**
 * The layout, one value per browser: sidebar, list and session (`full`), list and session (`list`), or
 * the session only (`session`). A pane it leaves out is in the one drawer instead (`useLayoutDrawer`),
 * laid out as it would dock, never resizing the session (a terminal keeps its size). The list leaves
 * only beside a session: with none open it is the page.
 *
 * What is saved is what was picked: a narrow screen shows the widest layout it can (`shownLayout`) and
 * never writes that back, so a Fold unfolded shows the saved one again.
 */
export type Layout = 'full' | 'list' | 'session'
export const LAYOUTS: readonly Layout[] = ['full', 'list', 'session']

export const LAYOUT_LABEL: Record<Layout, string> = {
  full: 'Sidebar, list and session',
  list: 'List and session',
  session: 'Session only',
}

interface LayoutPrefs {
  layout: Layout
  /** Where Alt+F goes back to from `session`: the layout before it. */
  previous: Layout
  setLayout: (layout: Layout) => void
  /** Alt+F: the session only, or back to the layout before it. */
  toggleSessionOnly: () => void
}

const isLayout = (v: unknown): v is Layout => typeof v === 'string' && (LAYOUTS as readonly string[]).includes(v)

/** Version 1 kept two booleans: the sidebar shown, the list shown. Each pair as the layout it was. */
export function migrateLayout(persisted: unknown, version: number): unknown {
  if (version >= 2 || !persisted || typeof persisted !== 'object') return persisted
  const old = persisted as { sidebar?: unknown; list?: unknown }
  const sidebar = typeof old.sidebar === 'boolean' ? old.sidebar : true
  const list = typeof old.list === 'boolean' ? old.list : true
  const layout: Layout = sidebar ? 'full' : list ? 'list' : 'session'
  return { layout, previous: 'full' }
}

export const useLayoutPrefs = create<LayoutPrefs>()(
  persist(
    (set) => ({
      layout: 'full',
      previous: 'full',
      setLayout: (layout) =>
        set((s) => (s.layout === layout ? s : layout === 'session' ? { layout, previous: s.layout } : { layout })),
      toggleSessionOnly: () =>
        set((s) => (s.layout === 'session' ? { layout: s.previous === 'session' ? 'full' : s.previous } : { layout: 'session', previous: s.layout })),
    }),
    {
      name: 'muxtower.layout',
      version: 2,
      migrate: migrateLayout,
      merge: (persisted, current) => {
        const out = mergeWithDefaults(persisted, current)
        return {
          ...out,
          layout: isLayout(out.layout) ? out.layout : 'full',
          previous: isLayout(out.previous) ? out.previous : 'full',
        }
      },
    },
  ),
)

/** What a screen shows of the saved layout: the sidebar docks only from `lg`; below `md` (a phone) there
 *  is no layout, one pane at a time (null). */
export function shownLayout(saved: Layout, screen: { dock: boolean; split: boolean }): Layout | null {
  if (!screen.split) return null
  return saved === 'full' && !screen.dock ? 'list' : saved
}

/** The layouts this screen can show, widest first: the switch's segments and the palette's commands. */
export function layoutsFor(screen: { dock: boolean; split: boolean }): Layout[] {
  return screen.split ? LAYOUTS.filter((l) => l !== 'full' || screen.dock) : []
}

export interface Panes {
  /** From `md`: a layout at all (the switch, Alt+F); below it, one pane at a time. */
  split: boolean
  /** From `lg`: the sidebar could dock. */
  dock: boolean
  /** The layout on screen (null on a phone). */
  shown: Layout | null
  sidebarDocked: boolean
  /** The list is in the drawer (beside an open session it would leave): with the sidebar, from `md`. */
  listInDrawer: boolean
  /** The drawer holds the sidebar alone (the list, if any, stays where it is). */
  sidebarAlone: boolean
}

/** Where each pane is on this screen, with a session open or not. Both media queries on every render:
 *  one skipped behind `&&` changed the hooks' order when it flipped (a Fold opened), and React crashed. */
export function usePanes(sessionOpen: boolean): Panes {
  const dock = useMediaQuery(SIDEBAR_QUERY)
  const split = useMediaQuery(SPLIT_QUERY)
  const saved = useLayoutPrefs((s) => s.layout)
  const shown = shownLayout(saved, { dock, split })
  const sidebarDocked = shown === 'full'
  const listInDrawer = sessionOpen && (!split || shown === 'session')
  return { split, dock, shown, sidebarDocked, listInDrawer, sidebarAlone: !sidebarDocked && !listInDrawer }
}

/** Alt+F (Option+F), from anywhere on the page, like Live's Alt+L: the session only, or back. By the
 *  key's position (`code`), so Option's character on a Mac is never typed; never with Ctrl or Cmd. */
export function useLayoutShortcut(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== 'KeyF') return
      e.preventDefault()
      useLayoutPrefs.getState().toggleSessionOnly()
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
