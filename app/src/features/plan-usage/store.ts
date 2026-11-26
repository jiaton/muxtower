import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mergeWithDefaults } from '@/lib/persist-merge'

export const THRESHOLDS = [70, 80, 90] as const

/** How many island subjects are remembered as shown: far more than live at once (a few accounts, a few
 *  windows each); the oldest go first. */
const SEEN_KEEP = 50

/** This device's plan-usage preferences: from which percent a window is highlighted (and the island
 *  grows), and which island subjects it has already shown (`subjectKey`), so each grows once, also across
 *  reloads; `forget` keeps only those that are still subjects. */
export const usePlanUsagePrefs = create<{
  threshold: number
  setThreshold: (threshold: number) => void
  seen: string[]
  markSeen: (key: string) => void
  forget: (live: string[]) => void
}>()(
  persist(
    (set) => ({
      threshold: 80,
      setThreshold: (threshold) => set({ threshold }),
      seen: [],
      markSeen: (key) => set((s) => (s.seen.includes(key) ? s : { seen: [...s.seen, key].slice(-SEEN_KEEP) })),
      forget: (live) => set((s) => (s.seen.every((k) => live.includes(k)) ? s : { seen: s.seen.filter((k) => live.includes(k)) })),
    }),
    { name: 'muxtower.plan-usage', version: 1, merge: mergeWithDefaults },
  ),
)

/** The island out right now, by its subject's key (`subjectKey`); null while it is the chip. */
export const useIsland = create<{ shown: string | null; show: (key: string) => void; settle: () => void }>((set) => ({
  shown: null,
  show: (shown) => set({ shown }),
  settle: () => set({ shown: null }),
}))
