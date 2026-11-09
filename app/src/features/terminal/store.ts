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
  /** Puts a whole message in the box in place of the draft and its quotes (a code block as a `!`
   *  command, which runs only when it is the message alone), for the owner to read and send. */
  fill: (key: string, text: string) => void
  /** Per session, how many times it was filled (not kept): the box takes focus, cursor at the end. */
  filled: Record<string, number>
  /** Per session, the quote just replied to (not kept): its card opens, its own reply focused, on each Reply,
   *  even to a quote already there (`n` counts the Replies). */
  quoted: Record<string, { n: number; text: string }>
  /** Per session, how many times words were written into the box from outside (Live mode; not kept):
   *  the box shows it for a moment. */
  landed: Record<string, number>
  land: (key: string) => void
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
        if (text) set((s) => ({ quoted: { ...s.quoted, [key]: { n: (s.quoted[key]?.n ?? 0) + 1, text } } }))
      },
      setQuotes: (key, list) =>
        set((s) => {
          const quotes = { ...s.quotes, [key]: list }
          if (!list.length) delete quotes[key]
          return { quotes }
        }),
      fill: (key, text) => {
        get().setQuotes(key, [])
        get().setDraft(key, text)
        set((s) => ({ filled: { ...s.filled, [key]: (s.filled[key] ?? 0) + 1 } }))
      },
      filled: {},
      quoted: {},
      landed: {},
      land: (key) => set((s) => ({ landed: { ...s.landed, [key]: (s.landed[key] ?? 0) + 1 } })),
    }),
    {
      name: 'muxtower.drafts',
      version: 2,
      partialize: ({ drafts, quotes }) => ({ drafts, quotes }),
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
