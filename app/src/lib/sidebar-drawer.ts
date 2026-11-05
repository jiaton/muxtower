import { create } from 'zustand'
import type { Pull } from '@/components/ui/gesture'

/** The sidebar as a drawer, where it is not docked (`SIDEBAR_QUERY`): open or not, and the `Pull` that
 *  opens it with the finger (a swipe right on the session list, `useSidebarPull`). */
interface SidebarDrawer {
  open: boolean
  setOpen: (open: boolean) => void
  pull: Pull | null
  setPull: (pull: Pull | null) => void
}

export const useSidebarDrawer = create<SidebarDrawer>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  pull: null,
  setPull: (pull) => set({ pull }),
}))
