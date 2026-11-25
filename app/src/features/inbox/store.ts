import { create } from 'zustand'

/** Whether the quick-add box is open (Alt+N anywhere, or the Inbox's +). UI state, not persisted. */
export const useQuickAdd = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
