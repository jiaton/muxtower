import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Check } from 'lucide-react'
import { useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Input } from './input'
import { keepFocus } from './gesture'

export interface Suggestion {
  value: string
  /** Shown after the value, quieter (e.g. how many sessions use it). */
  hint?: ReactNode
  /** Also matched against what is typed, besides the value (a session's name, where its id is the value). */
  keywords?: string
  /** Stands before the value (a project's colour dot). */
  icon?: ReactNode
}

const MAX_SHOWN = 6

/**
 * A text field that offers values while it has focus (a combobox): the ones containing what is typed,
 * picked by tap, or by arrow keys and Enter (`onPick` says which, after `onValueChange`). Keys it does not
 * use for the list (Enter with nothing highlighted) reach the caller's `onKeyDown`.
 *
 * By default the list sits under the field, in the flow, so a dialog never clips it. `floating`: the list
 * floats over what is under the field (a popover anchored to it, at least as wide as it), every value offered
 * until something is typed, the current one ticked: for a field among others in a row. `fresh`: what a value
 * none of the suggestions has is called (e.g. "new project"), said in the field and, floating, under the list
 * ("<value> will be a new project"), so a typo never passes for a known one.
 */
export function SuggestInput({
  value,
  onValueChange,
  onPick,
  suggestions,
  className,
  floating = false,
  fresh,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  onPick?: (value: string) => void
  suggestions: Suggestion[]
  floating?: boolean
  fresh?: string
}) {
  const listId = useId()
  const freshId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [typed, setTyped] = useState(false) // since focus: until then a floating list offers every value
  const trimmed = value.trim()
  const query = trimmed.toLowerCase()
  const isFresh = Boolean(fresh && trimmed && !suggestions.some((s) => s.value === trimmed))
  const shown =
    floating && !typed
      ? suggestions
      : suggestions
          .filter((s) => s.value !== value && `${s.value} ${s.keywords ?? ''}`.toLowerCase().includes(query))
          .slice(0, floating ? undefined : MAX_SHOWN)
  const freshLine = floating && isFresh
  const expanded = open && (shown.length > 0 || freshLine)

  const pick = (s: Suggestion) => {
    onValueChange(s.value)
    setActive(-1)
    setOpen(false)
    setTyped(false)
    onPick?.(s.value)
  }

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (expanded && shown.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + shown.length) % shown.length)
    } else if (expanded && e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(shown[active])
    } else if (expanded && e.key === 'Escape') {
      e.stopPropagation() // closes the list, not the dialog around it
      setOpen(false)
    } else onKeyDown?.(e)
  }

  const field = (
    <div className="relative">
      <Input
        {...props}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={isFresh ? freshId : props['aria-describedby']}
        autoComplete="off"
        value={value}
        className={cn(isFresh && 'pr-28', className)}
        onChange={(e) => {
          onValueChange(e.target.value)
          setActive(-1)
          setOpen(true)
          setTyped(true)
        }}
        onFocus={(e) => {
          setOpen(true)
          setTyped(false)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setOpen(false)
          setActive(-1)
          onBlur?.(e)
        }}
        onKeyDown={keyDown}
      />
      {isFresh ? (
        <span
          id={freshId}
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-md bg-accent-soft px-1.5 text-xs text-accent"
        >
          {fresh}
        </span>
      ) : null}
    </div>
  )

  const options = shown.length ? (
    <ul id={listId} role="listbox" className="flex flex-col py-1">
      {shown.map((s, i) => (
        <li
          key={s.value}
          id={`${listId}-${i}`}
          role="option"
          aria-selected={i === active}
          className={cn(
            'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-muted',
            i === active && 'bg-surface-muted',
          )}
          onPointerDown={keepFocus} // keep focus in the field
          onClick={() => pick(s)}
        >
          {s.icon}
          <span className="min-w-0 flex-1 truncate font-mono">{s.value}</span>
          {s.hint ? <span className="shrink-0 text-xs text-fg-muted">{s.hint}</span> : null}
          {floating ? (
            s.value === value ? (
              <Check role="img" aria-label="current" className="size-4 shrink-0 text-accent" />
            ) : (
              <span aria-hidden className="size-4 shrink-0" />
            )
          ) : null}
        </li>
      ))}
    </ul>
  ) : null

  if (!floating)
    return (
      <div className="flex flex-col gap-1">
        {field}
        {expanded ? <div className="overflow-hidden rounded-md border border-border bg-surface">{options}</div> : null}
      </div>
    )
  return (
    <PopoverPrimitive.Root open={expanded}>
      <PopoverPrimitive.Anchor asChild>{field}</PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()} // the field keeps focus
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-[90] flex max-h-[min(var(--radix-popover-content-available-height),16rem)] w-[var(--radix-popover-trigger-width)] min-w-56 flex-col overflow-y-auto rounded-md border border-border bg-surface shadow-card"
        >
          {options}
          {freshLine ? (
            <p className={cn('px-3 py-1.5 text-sm text-fg-muted', options && 'border-t border-border')}>
              <span className="font-mono text-fg">{trimmed}</span> will be a {fresh}
            </p>
          ) : null}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
