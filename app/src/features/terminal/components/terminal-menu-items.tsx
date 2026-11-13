import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenuCheckboxItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { FONT_SIZES, SCREEN_HEIGHTS, useTerminalPrefs } from '../store'

import { ink } from '@/components/ui/intents'

/** Terminal settings for a session's "⋯" menu: fit the pane to this screen (and how many screens tall),
 *  text size. */
export function TerminalMenuItems({ sessionId, fit }: { sessionId: string; fit: boolean }) {
  const { fontSize, setFontSize, screens, setScreens, setFit } = useTerminalPrefs()
  return (
    <>
      <DropdownMenuLabel>Terminal</DropdownMenuLabel>
      <DropdownMenuCheckboxItem checked={fit} onCheckedChange={(on) => setFit(sessionId, on === true)} onSelect={(e) => e.preventDefault()}>
        Fit width to this screen
      </DropdownMenuCheckboxItem>
      {fit ? (
        <Stepper
          label="Height"
          less="Shorter screen"
          more="Taller screen"
          values={SCREEN_HEIGHTS}
          value={screens}
          onChange={setScreens}
          format={(n) => `${n}×`}
        />
      ) : null}
      <Stepper label="Text size" less="Smaller text" more="Larger text" values={FONT_SIZES} value={fontSize} onChange={setFontSize} />
    </>
  )
}

function Stepper({
  label,
  less,
  more,
  values,
  value,
  onChange,
  format = String,
}: {
  label: string
  less: string
  more: string
  values: readonly number[]
  value: number
  onChange: (value: number) => void
  format?: (value: number) => string
}) {
  const index = Math.max(0, values.indexOf(value))
  const step = (by: number) => onChange(values[Math.min(values.length - 1, Math.max(0, index + by))])
  return (
    <div className={`${ink.body} flex min-h-9 items-center gap-2 px-2`}>
      <span className="flex-1">{label}</span>
      <Button variant="ghost" size="icon-sm" aria-label={less} disabled={index === 0} onClick={() => step(-1)}>
        <Minus />
      </Button>
      <span className={`${ink.count} ${ink.meta} w-6 text-center`}>{format(value)}</span>
      <Button variant="ghost" size="icon-sm" aria-label={more} disabled={index === values.length - 1} onClick={() => step(1)}>
        <Plus />
      </Button>
    </div>
  )
}
