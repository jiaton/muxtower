import { ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import { keepFocus } from './gesture'

/** One row of a token menu: something to insert (`text`), or a group folded to one row (`group`: chosen, it
 *  opens in place). `label` is what the row shows. */
export interface TokenRow {
  key: string
  label: ReactNode
  text?: string
  group?: string
}

/** What a token menu offers, given what is typed after its trigger and the groups opened. */
export interface TokenSource {
  rows: (query: string, open: ReadonlySet<string>) => TokenRow[]
  /** Where the token being typed starts and what is typed of it, at `caret` (null: not in one). */
  at: (value: string, caret: number) => { start: number; query: string } | null
  /** A row was chosen (to remember it). */
  picked?: (row: TokenRow) => void
  label: string
}

const NO_GROUPS: ReadonlySet<string> = new Set()

/**
 * A menu of tokens to insert at the caret of a text field, opened by what `source.at` recognizes (`@`, say):
 * Up/Down move, Enter or Tab inserts, Esc closes (until the caret leaves that token), typing filters; rows
 * are tapped on a phone. An input method's composition never opens or drives it. `onKeyDown` is to be called
 * first by the field's own; it says whether the key was the menu's. The field keeps the focus throughout.
 */
export function useTokenMenu(
  source: TokenSource | undefined,
  field: RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (value: string) => void,
) {
  const [at, setAt] = useState<{ start: number; query: string } | null>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(NO_GROUPS)
  const [active, setActive] = useState(0)
  const dismissed = useRef<number | null>(null) // the token Esc closed (by where it starts)
  const caretAfter = useRef<number | null>(null)

  const sync = useCallback(() => {
    const el = field.current
    if (!source || !el || el !== document.activeElement) return setAt(null)
    const found = source.at(el.value, el.selectionStart ?? el.value.length)
    if (!found || found.start === dismissed.current) {
      if (!found) dismissed.current = null
      return setAt(null)
    }
    setAt((was) => {
      if (was?.start !== found.start || was.query !== found.query) {
        setActive(0)
        if (was?.start !== found.start) setOpen(NO_GROUPS)
      }
      return found
    })
  }, [source, field])

  useEffect(() => {
    const el = field.current
    if (caretAfter.current !== null && el) {
      el.setSelectionRange(caretAfter.current, caretAfter.current)
      caretAfter.current = null
    }
    sync()
  }, [value, sync, field])

  const rows = at && source ? source.rows(at.query, open) : []
  const shown = at !== null && source !== undefined

  const choose = (row: TokenRow | undefined) => {
    const el = field.current
    if (!row || !at || !el) return
    if (row.group) {
      setOpen(new Set([...open, row.group]))
      return
    }
    const caret = el.selectionStart ?? value.length
    const text = `${row.text} `
    caretAfter.current = at.start + text.length
    setValue(value.slice(0, at.start) + text + value.slice(caret))
    source?.picked?.(row)
    setAt(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!shown || e.nativeEvent.isComposing || e.keyCode === 229) return false
    if (e.key === 'Escape') {
      dismissed.current = at.start
      setAt(null)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return false
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + rows.length) % rows.length)
    } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && rows.length) {
      choose(rows[Math.min(active, rows.length - 1)])
    } else return false
    e.preventDefault()
    return true
  }

  const menu = shown ? (
    <TokenMenu
      label={source.label}
      rows={rows}
      active={Math.min(active, Math.max(0, rows.length - 1))}
      onChoose={choose}
      anchor={field.current}
    />
  ) : null

  return { menu, onKeyDown, sync, close: () => setAt(null), open: shown }
}

const EDGE = 8 // px kept clear of the screen's sides
const WIDTH = 384

/** Where the list goes: just above its field, fixed on the screen, so a box that scrolls (a quote's
 *  reply, inside the quotes) cannot clip it; within the screen's width. */
function placeOver(anchor: HTMLElement | null) {
  if (!anchor) return undefined
  const r = anchor.getBoundingClientRect()
  const width = Math.min(WIDTH, window.innerWidth - 2 * EDGE)
  return {
    bottom: window.innerHeight - r.top + 4,
    left: Math.max(EDGE, Math.min(r.left, window.innerWidth - EDGE - width)),
    width,
  }
}

/** The list itself, above its field: at most about eight rows, scrolling. */
function TokenMenu({
  label,
  rows,
  active,
  onChoose,
  anchor,
}: {
  label: string
  rows: TokenRow[]
  active: number
  onChoose: (row: TokenRow) => void
  anchor: HTMLElement | null
}) {
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [active, rows.length])
  return (
    <ul
      ref={list}
      role="listbox"
      aria-label={label}
      style={placeOver(anchor)}
      className="fixed z-50 max-h-[17.5rem] overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-card"
    >
      {rows.length ? (
        rows.map((row, i) => (
          <li
            key={row.key}
            role="option"
            aria-selected={i === active}
            aria-expanded={row.group ? false : undefined}
            className={cn(
              'flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm',
              i === active ? 'bg-surface-muted' : 'hover:bg-surface-muted/60',
            )}
            onPointerDown={keepFocus} // the field keeps the focus (and a phone its keyboard)
            onClick={() => onChoose(row)}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">{row.label}</span>
            {row.group ? <ChevronRight className="size-3.5 shrink-0 text-fg-muted" aria-hidden /> : null}
          </li>
        ))
      ) : (
        <li className="px-2 py-1 text-sm text-fg-muted">No match</li>
      )}
    </ul>
  )
}
