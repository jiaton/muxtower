import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { randomId } from '@/lib/id'
import type { Daemon } from './types'

interface DaemonsState {
  daemons: Daemon[]
  add: (daemon: Omit<Daemon, 'id'>) => Daemon
  update: (id: string, patch: Partial<Omit<Daemon, 'id'>>) => void
  remove: (id: string) => void
}

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '')

export const useDaemonsStore = create<DaemonsState>()(
  persist(
    (set, get) => ({
      daemons: [],
      add: (input) => {
        const url = normalizeUrl(input.url)
        const existing = get().daemons.find((d) => d.url === url)
        if (existing) {
          get().update(existing.id, { ...input, url })
          return { ...existing, ...input, url }
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
