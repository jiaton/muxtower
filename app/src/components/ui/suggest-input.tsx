import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Input } from './input'

export interface Suggestion {
  value: string
  /** Shown after the value, quieter (e.g. how many sessions use it). */
  hint?: ReactNode
}

const MAX_SHOWN = 6

/** A text field that offers values while it has focus (a combobox): the ones containing what is typed,
 *  picked by tap, or by arrow keys and Enter. The list sits under the field, in the flow, so a dialog
 *  never clips it. */
export function SuggestInput({
  value,
  onValueChange,
  suggestions,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  suggestions: Suggestion[]
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const typed = value.trim().toLowerCase()
  const shown = suggestions.filter((s) => s.value !== value && s.value.toLowerCase().includes(typed)).slice(0, MAX_SHOWN)
  const expanded = open && shown.length > 0

  const pick = (s: Suggestion) => {
    onValueChange(s.value)
    setActive(-1)
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <Input
        {...props}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        className={className}
        onChange={(e) => {
          onValueChange(e.target.value)
          setActive(-1)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!expanded) return
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const step = e.key === 'ArrowDown' ? 1 : -1
            setActive((i) => (i + step + shown.length) % shown.length)
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault()
            pick(shown[active])
          } else if (e.key === 'Escape') {
            e.stopPropagation() // closes the list, not the dialog around it
            setOpen(false)
          }
        }}
      />
      {expanded ? (
        <ul id={listId} role="listbox" className="flex flex-col overflow-hidden rounded-md border border-border bg-surface py-1">
          {shown.map((s, i) => (
            <li
              key={s.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn(
                'flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm hover:bg-surface-muted',
                i === active && 'bg-surface-muted',
              )}
              onPointerDown={(e) => e.preventDefault()} // keep focus in the field
              onClick={() => pick(s)}
            >
              <span className="min-w-0 flex-1 truncate font-mono">{s.value}</span>
              {s.hint ? <span className="shrink-0 text-xs text-fg-muted">{s.hint}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
