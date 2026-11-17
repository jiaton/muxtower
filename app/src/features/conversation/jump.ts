import { create } from 'zustand'

/** Where a search led (the palette's "In conversations"): a session's item to show, once that session is
 *  open. Cleared on going back to the latest. Not kept. */
export const useJump = create<{ to: { key: string; seq: number } | null; go: (key: string, seq: number) => void; clear: () => void }>()(
  (set) => ({
    to: null,
    go: (key, seq) => set({ to: { key, seq } }),
    clear: () => set({ to: null }),
  }),
)
