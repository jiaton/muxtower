import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mergeWithDefaults } from '@/lib/persist-merge'

const RECENT_KEPT = 20

/** The command palette (Cmd+K): open or not, and what is typed in it. Not kept. */
export const usePalette = create<{ open: boolean; query: string; setOpen: (open: boolean) => void; setQuery: (q: string) => void }>()(
  (set) => ({
    open: false,
    query: '',
    setOpen: (open) => set(open ? { open } : { open, query: '' }),
    setQuery: (query) => set({ query }),
  }),
)

/** Sessions opened in this browser, the latest first (`entryKey`): what the palette offers before anything
 *  is typed. Kept in this browser only. */
export const useRecentSessions = create<{ keys: string[]; note: (key: string) => void }>()(
  persist(
    (set) => ({
      keys: [],
      note: (key) => set((s) => (s.keys[0] === key ? s : { keys: [key, ...s.keys.filter((k) => k !== key)].slice(0, RECENT_KEPT) })),
    }),
    { name: 'muxtower.recent-sessions', version: 1, merge: mergeWithDefaults },
  ),
)
