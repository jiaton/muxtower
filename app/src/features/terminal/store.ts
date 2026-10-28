import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { quoteOf } from './quotes'

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
  /** What each draft quotes (`quoteOf`), apart from its text, in the order added. */
  quotes: Record<string, string[]>
  addQuote: (key: string, selected: string) => void
  setQuotes: (key: string, quotes: string[]) => void
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
        const quote = quoteOf(selected)
        const quotes = get().quotes[key] ?? []
        if (quote && !quotes.includes(quote)) get().setQuotes(key, [...quotes, quote])
      },
      setQuotes: (key, list) =>
        set((s) => {
          const quotes = { ...s.quotes, [key]: list }
          if (!list.length) delete quotes[key]
          return { quotes }
        }),
    }),
    { name: 'muxtower.drafts', version: 1 },
  ),
)
