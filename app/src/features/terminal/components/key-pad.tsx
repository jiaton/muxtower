import { CornerDownLeft, Delete } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { useKeyRepeat } from '../hooks/use-key-repeat'

interface KeyDef {
  key: string
  label: ReactNode
  name: string
  repeat?: boolean
  /** Grid placement: 3 editing columns, a gap column, 3 arrow columns, Enter; 2 rows. */
  at: string
}

/** Where a keyboard has them: editing keys on the left, the arrows as an inverted T on the right, and
 *  Enter at the right edge, over the Send button. */
const KEYS: KeyDef[] = [
  { key: 'Escape', label: 'esc', name: 'Escape', at: 'col-start-1 row-start-1' },
  { key: 'Tab', label: 'tab', name: 'Tab', at: 'col-start-2 row-start-1' },
  { key: 'BTab', label: '⇧tab', name: 'Shift Tab', at: 'col-start-3 row-start-1' },
  { key: 'C-c', label: '^C', name: 'Control C', at: 'col-start-1 row-start-2' },
  { key: 'BSpace', label: <Delete />, name: 'Backspace', repeat: true, at: 'col-start-2 row-start-2' },
  { key: 'Space', label: 'space', name: 'Space', at: 'col-start-3 row-start-2' },
  { key: 'Up', label: '↑', name: 'Up', repeat: true, at: 'col-start-6 row-start-1' },
  { key: 'Left', label: '←', name: 'Left', repeat: true, at: 'col-start-5 row-start-2' },
  { key: 'Down', label: '↓', name: 'Down', repeat: true, at: 'col-start-6 row-start-2' },
  { key: 'Right', label: '→', name: 'Right', repeat: true, at: 'col-start-7 row-start-2' },
  { key: 'Enter', label: <CornerDownLeft />, name: 'Enter', at: 'col-start-8 row-span-2 row-start-1 h-auto' },
]

/** The keys an agent's TUI needs that a phone keyboard lacks. `keys`: the ones this session takes
 *  (empty: all). */
export function KeyPad({ keys, onKey, className }: { keys: string[]; onKey: (key: string) => void; className?: string }) {
  const press = useKeyRepeat((key) => {
    navigator.vibrate?.(8)
    onKey(key)
  })
  const shown = KEYS.filter((k) => !keys.length || keys.includes(k.key))
  // Only an interrupt key (Remote Control): one labelled key, not a pad.
  const sparse = shown.length < 3

  return (
    <div
      role="toolbar"
      aria-label="Keys"
      className={cn(
        sparse ? 'flex gap-1.5' : 'grid grid-cols-[repeat(3,minmax(0,1fr))_0.25rem_repeat(4,minmax(0,1fr))] grid-rows-2 gap-1.5',
        className,
      )}
    >
      {shown.map((k) => (
        <Button
          key={k.key}
          variant="secondary"
          size="key"
          aria-label={k.name}
          title={k.name}
          className={cn('', !sparse && k.at, sparse && 'px-3')}
          {...press(k.key, Boolean(k.repeat))}
        >
          {sparse && k.key === 'Escape' ? 'esc · interrupt' : k.label}
        </Button>
      ))}
    </div>
  )
}
