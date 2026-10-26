import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
export const foldKey = (...parts: string[]) => parts.join('\u0000')

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
}

/** Where the list is a drawer (a phone showing a session): whether it is open. Not persisted. */
export const useSessionDrawer = create<SessionDrawer>()((set) => ({ open: false, setOpen: (open) => set({ open }) }))
