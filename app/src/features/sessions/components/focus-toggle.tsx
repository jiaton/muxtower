import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCanSplit, useFocusShortcut, useLayoutPrefs } from '@/lib/layout-prefs'

/** Focus mode, in the session's header: the sidebar and the list away, the session the full width (each
 *  then a drawer over it); the same button, or Alt+F, brings them back. Only where they could stand
 *  beside the session at all. */
export function FocusToggle() {
  const canSplit = useCanSplit()
  const focused = useLayoutPrefs((s) => !s.sidebar && !s.list)
  const toggle = useLayoutPrefs((s) => s.toggleFocus)
  useFocusShortcut(canSplit)
  if (!canSplit) return null
  const label = focused ? 'Show the list and sidebar' : 'Focus: hide the list and sidebar'
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={focused} title={`${label} (Alt+F)`} onClick={toggle}>
      {focused ? <Minimize2 /> : <Maximize2 />}
    </Button>
  )
}
