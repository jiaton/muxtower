import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { randomId } from '@/lib/id'
import type { Daemon } from './types'

interface DaemonsState {
  daemons: Daemon[]
  add: (daemon: Omit<Daemon, 'id'>) => Daemon
  update: (id: string, patch: Partial<Omit<Daemon, 'id'>>) => void
  remove: (id: string) => void
}

export const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '')

export const useDaemonsStore = create<DaemonsState>()(
  persist(
    (set, get) => ({
      daemons: [],
      add: (input) => {
        const url = normalizeUrl(input.url)
        const existing = get().daemons.find((d) => d.url === url)
        if (existing) {
          const merged = { ...existing, ...input, url, token: input.token ?? existing.token }
          if (input.token) merged.rejected = false // a fresh token from pairing
          set((s) => ({ daemons: s.daemons.map((d) => (d.id === existing.id ? merged : d)) }))
          return merged
        }
        const daemon: Daemon = { ...input, url, id: randomId() }
        set((s) => ({ daemons: [...s.daemons, daemon] }))
        return daemon
      },
      update: (id, patch) =>
        set((s) => ({
          daemons: s.daemons.map((d) =>
            d.id === id ? { ...d, ...patch, url: patch.url ? normalizeUrl(patch.url) : d.url } : d,
          ),
        })),
      remove: (id) => set((s) => ({ daemons: s.daemons.filter((d) => d.id !== id) })),
    }),
    { name: 'muxtower.daemons', version: 1 },
  ),
)

/** Daemons this device can talk to: paired, and the token not rejected. */
export const usePairedDaemons = () =>
  useDaemonsStore(useShallow((s) => s.daemons.filter((d) => d.token !== null && !d.rejected)))
export const useRejectedDaemons = () => useDaemonsStore(useShallow((s) => s.daemons.filter((d) => d.rejected)))

/** Called when a daemon answers 401: its token was revoked, so further requests would only be counted as
 *  failed logins by the daemon's proxy (fail2ban). */
export function markRejected(id: string) {
  const daemon = useDaemonsStore.getState().daemons.find((d) => d.id === id)
  if (daemon && !daemon.rejected) useDaemonsStore.getState().update(id, { rejected: true })
}
export const useUnpairedDaemons = () => useDaemonsStore(useShallow((s) => s.daemons.filter((d) => d.token === null)))
export const useDaemon = (id: string) => useDaemonsStore((s) => s.daemons.find((d) => d.id === id))
