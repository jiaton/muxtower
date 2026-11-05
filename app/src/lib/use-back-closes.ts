import { useEffect, useRef } from 'react'

/** Back closes what is open (a drawer) instead of leaving the page: opening it adds a history entry of
 *  the same page, which Back pops. Closed some other way, that entry is taken back, unless the page moved
 *  on from it (a link inside, which replaces it). Returns the setter to close it with. */
export function useBackCloses(open: boolean, setOpen: (open: boolean) => void): (open: boolean) => void {
  const pushed = useRef<string | null>(null)
  useEffect(() => {
    if (!open) return
    pushed.current = location.href
    history.pushState(history.state, '', location.href)
    const back = () => {
      pushed.current = null
      setOpen(false)
    }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [open, setOpen])
  return (next: boolean) => {
    const at = pushed.current
    if (!next && at) {
      pushed.current = null
      // A link inside closes it as it goes: once that has replaced the entry, there is nothing to take back.
      window.setTimeout(() => location.href === at && history.back(), 50)
    }
    setOpen(next)
  }
}
