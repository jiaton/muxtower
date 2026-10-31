import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface Tab<T extends string> {
  id: T
  label: string
  description?: string
  icon?: ReactNode
}

export const tabId = (group: string, id: string) => `${group}-tab-${id}`
export const panelId = (group: string) => `${group}-panel`

/**
 * A row (pills) or column (cards, with a line under each label) of tabs, keyboard-operable like a native
 * tablist: arrows move and select, Home/End jump. The panel is the caller's: give it `id={panelId(group)}`,
 * `role="tabpanel"` and `aria-labelledby={tabId(group, value)}`.
 */
export function TabList<T extends string>({
  group,
  label,
  tabs,
  value,
  onChange,
  variant = 'pills',
  className,
}: {
  group: string
  label: string
  tabs: Tab<T>[]
  value: T
  onChange: (id: T) => void
  variant?: 'pills' | 'cards'
  className?: string
}) {
  const move = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1
    const next = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: last,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const tab = tabs[(next + tabs.length) % tabs.length]
    onChange(tab.id)
    document.getElementById(tabId(group, tab.id))?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={variant === 'cards' ? 'vertical' : 'horizontal'}
      className={cn(variant === 'pills' ? 'inline-flex flex-wrap gap-1 rounded-lg bg-surface-muted p-1' : 'flex flex-col gap-2', className)}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            id={tabId(group, tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(group)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              'text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              variant === 'pills'
                ? 'rounded-md px-3 py-1.5 text-sm font-medium text-fg-muted hover:text-fg aria-selected:bg-surface aria-selected:text-fg aria-selected:shadow-card'
                : 'flex gap-3 rounded-lg border border-transparent p-4 hover:bg-surface-muted aria-selected:border-border aria-selected:bg-surface aria-selected:shadow-card',
            )}
          >
            {tab.icon && <span className="mt-0.5 text-fg-muted [&_svg]:size-5">{tab.icon}</span>}
            <span className="flex flex-col gap-1">
              <span className={cn(variant === 'cards' && 'font-medium text-fg')}>{tab.label}</span>
              {tab.description && <span className="text-sm leading-relaxed text-fg-muted">{tab.description}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
