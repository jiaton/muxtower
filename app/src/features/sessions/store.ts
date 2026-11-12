import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Pull } from '@/components/ui/gesture'
import type { GroupBy } from './model/query'
import type { ListSearch } from './model/search'

interface ListPrefs {
  /** How the list is grouped when the URL does not say. */
  group: GroupBy
  setGroup: (group: GroupBy) => void
  /** Devices whose folders are folded away in the sidebar. */
  folded: string[]
  toggleFolded: (device: string) => void
  /** Groups and folder sections of the list that are collapsed (`foldKey`). */
  collapsed: string[]
  toggleCollapsed: (key: string) => void
}

/** Names a list group, or one of its sections, for `collapsed`: per grouping, so collapsing "Idle" by
 *  status leaves a device of that name alone. */
export { foldKey } from './model/list'

const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((i) => i !== item) : [...list, item])

export const useListPrefs = create<ListPrefs>()(
  persist(
    (set) => ({
      group: 'status',
      setGroup: (group) => set({ group }),
      folded: [],
      toggleFolded: (device) => set((s) => ({ folded: toggle(s.folded, device) })),
      collapsed: [],
      toggleCollapsed: (key) => set((s) => ({ collapsed: toggle(s.collapsed, key) })),
    }),
    { name: 'muxtower.list', version: 1 },
  ),
)

interface ListMemory {
  /** Where each list was scrolled to. */
  positions: Record<string, number>
  /** What the list last showed, so coming back from elsewhere (Daemons) shows it again. */
  lastSearch: ListSearch
}

/** Remembered for this visit only (not persisted). */
export const useListMemory = create<ListMemory>()(() => ({ positions: {}, lastSearch: {} }))

interface SessionDrawer {
  /** The list is open over the session being shown (phones). */
  open: boolean
  setOpen: (open: boolean) => void
  /** While it is shut: what pulls it open with the finger (a swipe right on the session). */
  pull: Pull | null
  setPull: (pull: Pull | null) => void
}

/** Where the list is a drawer (a phone showing a session): whether it is open. Not persisted. */
export const useSessionDrawer = create<SessionDrawer>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  pull: null,
  setPull: (pull) => set({ pull }),
}))

export type SessionView = 'terminal' | 'conversation'
const VIEWS_KEPT = 300

interface SessionViews {
  /** Per session (`entryKey`): the view the owner last chose, terminal or conversation. */
  views: Record<string, SessionView>
  /** The one chosen last anywhere: where a session not opened before starts. */
  last?: SessionView
  setView: (key: string, view: SessionView) => void
}

/** Which view of a session it opens on: the one the owner left it on. */
export const useSessionViews = create<SessionViews>()(
  persist(
    (set) => ({
      views: {},
      setView: (key, view) =>
        set((s) => {
          const { [key]: _, ...rest } = s.views // to the end: the oldest go first
          const kept = Object.entries(rest).slice(-(VIEWS_KEPT - 1))
          return { views: { ...Object.fromEntries(kept), [key]: view }, last: view }
        }),
    }),
    { name: 'muxtower.views', version: 1 },
  ),
)

interface NewSessionPrefs {
  /** The agent (runtime name) a new session was last started with: what the dialog offers first. */
  runtime: string
  setRuntime: (runtime: string) => void
}

export const useNewSessionPrefs = create<NewSessionPrefs>()(
  persist(
    (set) => ({
      runtime: 'claude-code',
      setRuntime: (runtime) => set({ runtime }),
    }),
    { name: 'muxtower.new-session', version: 1 },
  ),
)
