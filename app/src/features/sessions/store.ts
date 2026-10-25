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
}

export const useListPrefs = create<ListPrefs>()(
  persist(
    (set) => ({
      group: 'status',
      setGroup: (group) => set({ group }),
      folded: [],
      toggleFolded: (device) =>
        set((s) => ({ folded: s.folded.includes(device) ? s.folded.filter((d) => d !== device) : [...s.folded, device] })),
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
