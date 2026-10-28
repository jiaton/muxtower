import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { quoteOf, type Quote } from './quotes'

export const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18] as const
/** How many screens tall a fitted pane is: a full-screen program (Claude Code's fullscreen renderer)
 *  keeps no scrollback, so a taller pane is what lets it show more than one screen of output. */
export const SCREEN_HEIGHTS = [1, 2, 3, 4] as const

interface TerminalPrefs {
  fontSize: number
  /** Per session: fit the pane's width to this screen. Unset = the default for its source. */
  fit: Record<string, boolean>
  setFontSize: (size: number) => void
  setFit: (sessionId: string, fit: boolean) => void
  /** The key pad above the message box is open. */
  keypad: boolean
  setKeypad: (open: boolean) => void
  /** A fitted pane's height, in screens of this view (SCREEN_HEIGHTS). */
  screens: number
  setScreens: (screens: number) => void
}

export const useTerminalPrefs = create<TerminalPrefs>()(
  persist(
    (set) => ({
      fontSize: 12,
      fit: {},
      setFontSize: (fontSize) => set({ fontSize }),
      setFit: (sessionId, value) => set((s) => ({ fit: { ...s.fit, [sessionId]: value } })),
      keypad: false,
      setKeypad: (keypad) => set({ keypad }),
      screens: 2,
      setScreens: (screens) => set({ screens }),
    }),
    { name: 'muxtower.terminal', version: 1 },
  ),
)

/** Which draft a session's is, in `useDrafts`. */
export const draftKey = (daemonId: string, sessionId: string) => `${daemonId}/${sessionId}`

interface Drafts {
  /** Unsent messages, per session (`daemonId/sessionId`): kept through switching sessions, the phone
   *  closing the app, a reload. */
  drafts: Record<string, string>
  setDraft: (key: string, text: string) => void
  /** What each draft quotes (`quoteOf`), with a reply to each, apart from its text, in the order added. */
  quotes: Record<string, Quote[]>
  addQuote: (key: string, selected: string) => void
  setQuotes: (key: string, quotes: Quote[]) => void
}

export const useDrafts = create<Drafts>()(
  persist(
    (set, get) => ({
      drafts: {},
      setDraft: (key, text) =>
        set((s) => {
          const drafts = { ...s.drafts, [key]: text }
          if (!text) delete drafts[key]
          return { drafts }
        }),
      quotes: {},
      addQuote: (key, selected) => {
        const text = quoteOf(selected)
        const quotes = get().quotes[key] ?? []
        if (text && !quotes.some((q) => q.text === text)) get().setQuotes(key, [...quotes, { text, reply: '' }])
      },
      setQuotes: (key, list) =>
        set((s) => {
          const quotes = { ...s.quotes, [key]: list }
          if (!list.length) delete quotes[key]
          return { quotes }
        }),
    }),
    {
      name: 'muxtower.drafts',
      version: 2,
      // 1: quotes were their text alone (no reply of their own).
      migrate: (old, version) => {
        const state = (old ?? {}) as { drafts?: Record<string, string>; quotes?: Record<string, (string | Quote)[]> }
        if (version >= 2) return state as Drafts
        const quotes = Object.fromEntries(
          Object.entries(state.quotes ?? {}).map(([key, list]) => [
            key,
            list.map((q) => (typeof q === 'string' ? { text: q, reply: '' } : q)),
          ]),
        )
        return { ...state, quotes } as Drafts
      },
    },
  ),
)
