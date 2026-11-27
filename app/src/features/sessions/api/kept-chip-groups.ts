import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { safeJSONStorage } from '@/lib/safe-storage'
import type { ChipGroup } from '../model/chip-groups'

/**
 * The owner's chip groups as their keeper (the hub) last gave them, per daemon, kept in this browser: the
 * row shows them while the hub restarts or the app opens again, instead of none, until it answers.
 */
interface KeptChipGroups {
  byDaemon: Record<string, ChipGroup[]>
  keep: (daemonId: string, groups: ChipGroup[]) => void
}

export const useKeptChipGroups = create<KeptChipGroups>()(
  persist(
    (set) => ({
      byDaemon: {},
      keep: (daemonId, groups) => set((s) => (s.byDaemon[daemonId] === groups ? s : { byDaemon: { ...s.byDaemon, [daemonId]: groups } })),
    }),
    {
      name: 'muxtower.chip-groups',
      version: 1,
      storage: safeJSONStorage(),
      partialize: (s) => ({ byDaemon: s.byDaemon }),
      merge: (persisted, current) => ({ ...current, byDaemon: readable((persisted as { byDaemon?: unknown } | null)?.byDaemon) }),
    },
  ),
)

const isGroup = (g: unknown): g is ChipGroup => {
  const v = g as Partial<ChipGroup> | null
  return typeof v === 'object' && v !== null && typeof v.id === 'string' && typeof v.name === 'string' && Array.isArray(v.projects)
}

/** What an older or broken version kept: only each daemon's list of well-formed groups. */
function readable(byDaemon: unknown): Record<string, ChipGroup[]> {
  if (!byDaemon || typeof byDaemon !== 'object' || Array.isArray(byDaemon)) return {}
  const kept: Record<string, ChipGroup[]> = {}
  for (const [id, groups] of Object.entries(byDaemon))
    if (Array.isArray(groups) && groups.every(isGroup))
      kept[id] = groups.map((g) => ({ ...g, sessions: Array.isArray(g.sessions) ? g.sessions : [] }))
  return kept
}
