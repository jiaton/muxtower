import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check, type LucideIcon } from 'lucide-react'
import { useRef, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { look } from './intents'
import { Truncated } from './truncated'

/** Where a menu opens as a sheet from the bottom, full width: a phone, or a narrow touch screen. */
export const SHEET_QUERY = `${PHONE_QUERY}, (pointer: coarse) and (max-width: 47.99rem)`
const SWIPE_CLOSES_PX = 80

/** Not modal: a modal menu locks the page while open, and a dialog opened from one of its items takes
 *  that lock for the page's own state and puts it back on closing, leaving the page unclickable. */
export function DropdownMenu({ modal = false, ...props }: ComponentProps<typeof Menu.Root>) {
  return <Menu.Root modal={modal} {...props} />
}
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuGroup = Menu.Group
export const DropdownMenuRadioGroup = Menu.RadioGroup

/** The key that picks an item with a shortcut (`DropdownMenuItem shortcut`): a letter, or Delete as "x". */
const shortcutOf = (e: KeyboardEvent<HTMLElement>) =>
  e.ctrlKey || e.metaKey || e.altKey ? null : e.key === 'Delete' ? 'x' : e.key.length === 1 ? e.key.toLowerCase() : null

/** A menu's box: beside its trigger on a desktop, never past the screen (at most 20rem wide, as tall as
 *  the room there, scrolling inside), its items cut to one line; on a phone a sheet from the bottom, full
 *  width, over the page, scrolling inside, closed by a swipe down, Esc or a tap outside. An item's own key
 *  picks it (`DropdownMenuItem shortcut`; the keys are shown on a desktop only). */
export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  onKeyDown,
  children,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  const sheet = useMediaQuery(SHEET_QUERY)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ from: number; by: number } | null>(null)
  const move = (by: number) => {
    if (box.current) box.current.style.transform = by > 0 ? `translateY(${by}px)` : ''
  }
  const close = () => box.current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  return (
    <>
      {sheet ? (
        <Menu.Portal>
          <div aria-hidden className="fixed inset-0 z-[89] bg-overlay" />
        </Menu.Portal>
      ) : null}
      <Menu.Portal>
        <Menu.Content
          ref={box}
          data-sheet={sheet || undefined}
          sideOffset={sideOffset}
          align={align}
          collisionPadding={8}
          // An item's own key picks it, as a click would (and closes the menu); before the menu's own
          // type-ahead, which would only move to the first item starting with that letter.
          onKeyDown={(e) => {
            onKeyDown?.(e)
            const key = shortcutOf(e)
            const target = key ? e.currentTarget.querySelector<HTMLElement>(`[data-shortcut="${key}"]:not([data-disabled])`) : null
            if (!target) return
            e.preventDefault()
            e.stopPropagation()
            target.click()
          }}
          // A sheet follows a finger pulling it down from its top, and goes past a little way down.
          onPointerDown={(e) => {
            if (sheet && e.pointerType !== 'mouse' && e.currentTarget.scrollTop <= 0) drag.current = { from: e.clientY, by: 0 }
          }}
          onPointerMove={(e) => {
            if (!drag.current) return
            drag.current.by = e.clientY - drag.current.from
            move(drag.current.by)
          }}
          onPointerUp={() => {
            const by = drag.current?.by ?? 0
            drag.current = null
            if (by > SWIPE_CLOSES_PX) close()
            else move(0)
          }}
          onPointerCancel={() => {
            drag.current = null
            move(0)
          }}
          className={cn(
            sheet
              ? 'z-[90] flex max-h-[85dvh] w-full touch-pan-y flex-col overflow-y-auto overscroll-contain rounded-t-lg border-t border-border bg-surface p-1 pt-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-card [&_[data-detail]>span]:line-clamp-2 [&_[data-detail]>span]:whitespace-normal [&_[data-hint]]:hidden'
              : 'z-[90] flex max-h-[min(var(--radix-dropdown-menu-content-available-height),32rem)] w-max max-w-[min(20rem,calc(100vw-16px))] min-w-52 flex-col overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-card',
            className,
          )}
          {...props}
        >
          {sheet ? <div aria-hidden className="mx-auto my-2 h-1 w-10 shrink-0 rounded-full bg-border" /> : null}
          {children}
        </Menu.Content>
      </Menu.Portal>
    </>
  )
}

/** An item's text: its label on one line, and under it, quieter, what it is now (`detail`: a role, a
 *  value), each cut with an ellipsis where too long, and shown whole at once when pointed at or focused. */
function ItemText({ label, detail }: { label: ReactNode; detail?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <Truncated>{label}</Truncated>
      {detail ? (
        <span data-detail className="flex min-w-0 text-xs text-fg-muted">
          <Truncated>{detail}</Truncated>
        </span>
      ) : null}
    </span>
  )
}

const item =
  'flex min-h-9 min-w-0 cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted'

/** An item: its `icon`, its text (`children`, with a `detail` line under it), and `shortcut`, a key that
 *  picks it while the menu is open, shown at its end as a key. Text given as children with an icon of its
 *  own inside (older items) is drawn as it is. */
export function DropdownMenuItem({
  className,
  tone,
  shortcut,
  icon: Icon,
  detail,
  children,
  ...props
}: ComponentProps<typeof Menu.Item> & { tone?: 'danger'; shortcut?: string; icon?: LucideIcon; detail?: ReactNode }) {
  return (
    <Menu.Item
      className={cn(item, tone === 'danger' && 'text-danger [&_svg]:text-danger', className)}
      data-shortcut={shortcut}
      aria-keyshortcuts={shortcut === 'x' ? 'X Delete' : shortcut?.toUpperCase()}
      {...props}
    >
      {Icon ? <Icon /> : null}
      {Icon || detail ? <ItemText label={children} detail={detail} /> : children}
      {shortcut ? (
        <kbd data-hint aria-hidden className={cn('ml-auto shrink-0', look.keycap)}>
          {shortcut.toUpperCase()}
        </kbd>
      ) : null}
    </Menu.Item>
  )
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(item, 'pr-8', className)} {...props}>
      {children}
      <Menu.ItemIndicator className="ml-auto">
        <Check />
      </Menu.ItemIndicator>
    </Menu.CheckboxItem>
  )
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(item, className)} {...props}>
      {children}
      <Menu.ItemIndicator className="ml-auto">
        <Check />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  )
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn('px-2 pt-2 pb-1 text-xs font-medium text-fg-muted', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('my-1 h-px bg-border', className)} {...props} />
}
