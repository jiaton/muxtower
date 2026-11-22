import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mergeWithDefaults } from './persist-merge'
import { safeJSONStorage } from './safe-storage'

/** How many messages a session keeps to recall. */
export const HISTORY_KEPT = 20

/**
 * The messages sent from each session's message box, newest last, on this browser only (text only: no
 * quotes, pictures or files), for ↑ and ↓ in an empty box (`useComposerKeys`). Keyed like the drafts
 * (`daemonId/sessionId`). A session's go when it is deleted (`forgetHistory`).
 */
interface ComposerHistory {
  sent: Record<string, string[]>
  record: (key: string, text: string) => void
  forget: (key: string) => void
}

export const useComposerHistory = create<ComposerHistory>()(
  persist(
    (set) => ({
      sent: {},
      record: (key, text) =>
        set((s) => {
          const list = s.sent[key] ?? []
          if (!text.trim() || list[list.length - 1] === text) return s // the same again: kept once, as a shell does
          return { sent: { ...s.sent, [key]: [...list, text].slice(-HISTORY_KEPT) } }
        }),
      forget: (key) =>
        set((s) => {
          if (!(key in s.sent)) return s
          const { [key]: _gone, ...rest } = s.sent
          return { sent: rest }
        }),
    }),
    { name: 'muxtower.composer-history', version: 1, storage: safeJSONStorage(), merge: mergeWithDefaults },
  ),
)

/** A deleted session's sent messages, gone from this browser. */
export const forgetHistory = (daemonId: string, sessionId: string) => useComposerHistory.getState().forget(`${daemonId}/${sessionId}`)
