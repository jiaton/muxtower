import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { returnTarget } from './dialog'
import { ink, look } from './intents'

export interface PaletteItem {
  id: string
  /** What it is read out as (and its title when cut short). */
  label: string
  /** How its row looks; `label` alone when none. */
  children?: ReactNode
  /** A key that does it anywhere, shown as keycaps ("Alt+L"). */
  keys?: string
  onSelect: () => void
}

export interface PaletteSection {
  id: string
  label: string
  items: PaletteItem[]
  /** Said in place of its items while they are on their way. */
  note?: string
}

/**
 * A floating box to type into and pick from, over any page: sections of items, ↑/↓ (and Home/End) move,
 * Enter picks, a pointer picks too, Esc closes it and focus goes back to where it was. Near the top on a
 * wide screen; on a phone the width of the screen, at its top, so the keyboard leaves it room. What the
 * items are, and how they are found, is the caller's: this only shows them and moves among them.
 */
export function CommandPalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
  sections,
  label,
  placeholder,
  empty,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
  sections: PaletteSection[]
  label: string
  placeholder?: string
  /** Said when nothing matches. */
  empty?: ReactNode
}) {
  const items = sections.flatMap((s) => s.items)
  const [active, setActive] = useState(0)
  const listId = useId()
  const list = useRef<HTMLDivElement>(null)
  // Where focus goes back to: taken as it opens (while rendering, before its box takes focus).
  const [returnTo, setReturnTo] = useState<{ open: boolean; to: HTMLElement | null }>({ open: false, to: null })
  if (returnTo.open !== open) {
    const now = document.activeElement
    setReturnTo({ open, to: open ? (returnTarget() ?? (now instanceof HTMLElement && now !== document.body ? now : null)) : returnTo.to })
  }
  const shape = items.map((i) => i.id).join('\n')
  useEffect(() => setActive(0), [shape])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active])
  const at = Math.min(active, Math.max(items.length - 1, 0))
  const pick = (item: PaletteItem | undefined) => {
    if (!item) return
    onOpenChange(false)
    item.onSelect()
  }
  const move = (to: number) => items.length && setActive((to + items.length) % items.length)
  let index = -1
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-overlay" />
        <DialogPrimitive.Content
          aria-label={label}
          className={cn(
            'fixed inset-x-0 top-0 z-[90] flex max-h-[70dvh] flex-col rounded-b-lg border border-border bg-surface shadow-card',
            'pt-[env(safe-area-inset-top)] sm:inset-x-auto sm:top-[12dvh] sm:left-1/2 sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:rounded-lg sm:pt-0',
          )}
          onCloseAutoFocus={(e) => {
            if (!returnTo.to?.isConnected) return
            e.preventDefault()
            returnTo.to.focus()
          }}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Type to find; up and down arrows move, Enter opens, Escape closes.
          </DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className={`${ink.quiet} size-4 shrink-0`} aria-hidden />
            <input
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={items.length ? `${listId}-${at}` : undefined}
              aria-autocomplete="list"
              aria-label={label}
              autoFocus
              enterKeyHint="go"
              value={query}
              placeholder={placeholder}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return // an IME choosing its characters
                if (e.key === 'ArrowDown') (e.preventDefault(), move(at + 1))
                else if (e.key === 'ArrowUp') (e.preventDefault(), move(at - 1))
                else if (e.key === 'Home' && !query) (e.preventDefault(), move(0))
                else if (e.key === 'End' && !query) (e.preventDefault(), move(items.length - 1))
                else if (e.key === 'Enter') (e.preventDefault(), pick(items[at]))
              }}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-muted"
            />
          </div>
          <div ref={list} id={listId} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-1">
            {sections.map((section) =>
              section.items.length || section.note ? (
                <div key={section.id} role="group" aria-label={section.label} className="flex flex-col py-1">
                  <div className={cn(ink.eyebrow, 'px-2 py-1')}>{section.label}</div>
                  {section.note && !section.items.length ? <div className={cn(ink.meta, 'px-2 py-1')}>{section.note}</div> : null}
                  {section.items.map((item) => {
                    index += 1
                    const i = index
                    return (
                      <div
                        key={item.id}
                        id={`${listId}-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={i === at}
                        aria-label={item.label}
                        title={item.label}
                        onPointerMove={() => i !== at && setActive(i)}
                        onClick={() => pick(item)}
                        className={cn(
                          'flex min-h-10 cursor-default items-center gap-2 rounded-md px-2 py-1.5',
                          i === at ? look.selected : undefined,
                        )}
                      >
                        <div className="min-w-0 flex-1">{item.children ?? <span className={ink.body}>{item.label}</span>}</div>
                        {item.keys ? (
                          <span className="hidden shrink-0 gap-1 pointer-fine:flex" aria-hidden>
                            {item.keys.split('+').map((k) => (
                              <kbd key={k} className={look.keycap}>
                                {k}
                              </kbd>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null,
            )}
            {!items.length && !sections.some((s) => s.note) ? <div className={cn(ink.hint, 'px-2 py-6 text-center')}>{empty}</div> : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
