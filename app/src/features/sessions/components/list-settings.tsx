import { Checkbox } from '@/components/ui/checkbox'
import { ink } from '@/components/ui/intents'
import { useChipSwitchPrefs } from '../store'

/** This browser's session list: whether a sideways wheel over the list switches the chip of the projects row. */
export function ListSettings() {
  const wheel = useChipSwitchPrefs((s) => s.wheel)
  const setWheel = useChipSwitchPrefs((s) => s.setWheel)
  return (
    <section aria-labelledby="list-settings" className="flex flex-col gap-2">
      <h2 id="list-settings" className={ink.label}>
        Session list (this browser)
      </h2>
      <label className={`${ink.body} flex items-start gap-2`}>
        <Checkbox checked={wheel} onChange={(e) => setWheel(e.target.checked)} aria-label="Switch chips with a sideways wheel" />
        <span>
          Switch chips with a sideways wheel{' '}
          <span className={ink.quiet}>
            · a mouse's thumb wheel, or Shift and the wheel, over the list picks the chip before or after. [ and ] do it from the keyboard.
          </span>
        </span>
      </label>
    </section>
  )
}
