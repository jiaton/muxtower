import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mergeWithDefaults } from './persist-merge'

const KEPT = 20

/** The severe alerts (`diagnostics-alerts.ts`) dismissed from the mark by the app's name, by `alertKey`: the
 *  same condition never shows there again; Daemons › Diagnostics still says it. Per browser. */
interface DismissedAlerts {
  keys: string[]
  dismiss: (key: string) => void
}

export const useDismissedAlerts = create<DismissedAlerts>()(
  persist(
    (set) => ({
      keys: [],
      dismiss: (key) => set((s) => (s.keys.includes(key) ? s : { keys: [...s.keys, key].slice(-KEPT) })),
    }),
    {
      name: 'muxtower.dismissed-alerts',
      merge: (persisted, current) => {
        const out = mergeWithDefaults(persisted, current)
        return { ...out, keys: Array.isArray(out.keys) ? out.keys.filter((k) => typeof k === 'string') : [] }
      },
    },
  ),
)
