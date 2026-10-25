import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18] as const

interface TerminalPrefs {
  fontSize: number
  /** Per session: fit the pane's width to this screen. Unset = the default for its source. */
  fit: Record<string, boolean>
  setFontSize: (size: number) => void
  setFit: (sessionId: string, fit: boolean) => void
  /** The key pad above the message box is open. */
  keypad: boolean
  setKeypad: (open: boolean) => void
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
    }),
    { name: 'muxtower.terminal', version: 1 },
  ),
)
