import { Fullscreen } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { toggleFullScreen } from '@/lib/layout-prefs'

/** The browser's own full screen, for the session page's menu; offered only where the browser has one
 *  (`canFullScreen`). */
export function FullScreenItem() {
  return (
    <DropdownMenuItem onSelect={toggleFullScreen}>
      <Fullscreen /> {document.fullscreenElement ? 'Exit full screen' : 'Full screen'}
    </DropdownMenuItem>
  )
}
