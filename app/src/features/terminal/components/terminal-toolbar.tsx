import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { FONT_SIZES, useTerminalPrefs } from '../store'

/** Fit the pane's width to this screen, and the text size. */
export function TerminalToolbar({ sessionId, fit }: { sessionId: string; fit: boolean }) {
  const { fontSize, setFontSize, setFit } = useTerminalPrefs()
  const index = FONT_SIZES.indexOf(fontSize as (typeof FONT_SIZES)[number])
  const step = (by: number) => setFontSize(FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (index < 0 ? 2 : index) + by))])
  const id = `fit-${sessionId}`
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="flex flex-1 items-center gap-2 text-sm text-fg-muted">
        <Switch id={id} checked={fit} onCheckedChange={(on) => setFit(sessionId, on)} />
        Fit width to this screen
      </label>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Smaller text" onClick={() => step(-1)}>
          <Minus />
        </Button>
        <span className="w-6 text-center text-xs text-fg-muted tabular-nums">{fontSize}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Larger text" onClick={() => step(1)}>
          <Plus />
        </Button>
      </div>
    </div>
  )
}
