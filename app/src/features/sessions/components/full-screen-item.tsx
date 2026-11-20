import { Fullscreen, Minimize } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { toggleFullScreen, useFullScreen } from '@/lib/layout-prefs'

/** The browser's own full screen, for the session page's menu; offered only where the browser has one
 *  (`canFullScreen`). While it is on, the item reads "Exit full screen" (kept by `fullscreenchange`). */
export function FullScreenItem() {
  const on = useFullScreen()
  return (
    <DropdownMenuItem icon={on ? Minimize : Fullscreen} onSelect={toggleFullScreen}>
      {on ? 'Exit full screen' : 'Full screen'}
    </DropdownMenuItem>
  )
}
