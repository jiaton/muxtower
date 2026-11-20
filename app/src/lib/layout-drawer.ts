import { useEffect } from 'react'
import { create } from 'zustand'
import type { Pull } from '@/components/ui/gesture'

/**
 * The one drawer: the panes the layout leaves out (`usePanes`), laid out as they would dock. With the
 * list in it (beside an open session it would leave), it is the list's drawer, the sidebar beside the
 * list from `md` (`sidebarSlot`, where the root shell puts the sidebar); else the sidebar's alone. Open
 * or not, and the `Pull` that opens it with the finger (a swipe right on the session or the list).
 */
interface LayoutDrawer {
  open: boolean
  setOpen: (open: boolean) => void
  pull: Pull | null
  setPull: (pull: Pull | null) => void
  /** Inside the list's drawer: where the sidebar goes, beside the list. */
  sidebarSlot: HTMLElement | null
  setSidebarSlot: (el: HTMLElement | null) => void
}

export const useLayoutDrawer = create<LayoutDrawer>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  pull: null,
  setPull: (pull) => set({ pull }),
  sidebarSlot: null,
  setSidebarSlot: (sidebarSlot) => set({ sidebarSlot }),
}))

/** Back closes the drawer instead of leaving the page: while it is open (and `active`, a drawer at all)
 *  the page has a second history entry, which Back pops. Closed any other way (Esc, a tap outside, a
 *  swipe, a layout picked), that entry is taken back, unless the page moved on from it (a link inside,
 *  which replaces it). */
export function useDrawerHistory(active: boolean) {
  const shown = useLayoutDrawer((s) => s.open) && active
  useEffect(() => {
    if (!shown) return
    let at: string | null = location.href
    history.pushState(history.state, '', location.href)
    const back = () => {
      at = null
      useLayoutDrawer.getState().setOpen(false)
    }
    window.addEventListener('popstate', back)
    return () => {
      window.removeEventListener('popstate', back)
      const was = at
      // A link inside closes it as it goes: once that has replaced the entry, there is nothing to take back.
      if (was) window.setTimeout(() => location.href === was && history.back(), 50)
    }
  }, [shown])
}
