import { create } from 'zustand'

/** The file picker of each message box showing, by its draft key (`daemonId/sessionId`): ⌘K's "Attach a
 *  file…" opens the one of the session in front. Its composer sets it while it shows. */
export const useAttachPickers = create<{
  pickers: Record<string, () => void>
  set: (key: string, open: (() => void) | null) => void
}>()((set) => ({
  pickers: {},
  set: (key, open) =>
    set((s) => {
      const pickers = { ...s.pickers }
      if (open) pickers[key] = open
      else delete pickers[key]
      return { pickers }
    }),
}))
