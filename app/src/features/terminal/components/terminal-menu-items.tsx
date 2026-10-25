import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenuCheckboxItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { FONT_SIZES, useTerminalPrefs } from '../store'

/** Terminal settings for a session's "⋯" menu: fit the pane's width to this screen, text size. */
export function TerminalMenuItems({ sessionId, fit }: { sessionId: string; fit: boolean }) {
  const { fontSize, setFontSize, setFit } = useTerminalPrefs()
  const index = Math.max(0, FONT_SIZES.indexOf(fontSize as (typeof FONT_SIZES)[number]))
  const step = (by: number) => setFontSize(FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, index + by))])
  return (
    <>
      <DropdownMenuLabel>Terminal</DropdownMenuLabel>
      <DropdownMenuCheckboxItem checked={fit} onCheckedChange={(on) => setFit(sessionId, on === true)} onSelect={(e) => e.preventDefault()}>
        Fit width to this screen
      </DropdownMenuCheckboxItem>
      <div className="flex min-h-9 items-center gap-2 px-2 text-sm">
        <span className="flex-1">Text size</span>
        <Button variant="ghost" size="icon-sm" aria-label="Smaller text" disabled={index === 0} onClick={() => step(-1)}>
          <Minus />
        </Button>
        <span className="w-6 text-center text-xs text-fg-muted tabular-nums">{fontSize}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Larger text" disabled={index === FONT_SIZES.length - 1} onClick={() => step(1)}>
          <Plus />
        </Button>
      </div>
    </>
  )
}
