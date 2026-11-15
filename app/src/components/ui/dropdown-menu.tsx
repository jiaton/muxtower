import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import type { ComponentProps, KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

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

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  onKeyDown,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
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
        className={cn(
          'z-[90] flex max-h-[min(70dvh,32rem)] min-w-52 flex-col overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-card',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  )
}

const item =
  'flex min-h-9 cursor-default items-center gap-2 rounded-sm px-2 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted'

/** An item; `shortcut`: a key that picks it while the menu is open, shown at its end. */
export function DropdownMenuItem({
  className,
  tone,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof Menu.Item> & { tone?: 'danger'; shortcut?: string }) {
  return (
    <Menu.Item
      className={cn(item, tone === 'danger' && 'text-danger [&_svg]:text-danger', className)}
      data-shortcut={shortcut}
      aria-keyshortcuts={shortcut === 'x' ? 'X Delete' : shortcut?.toUpperCase()}
      {...props}
    >
      {children}
      {shortcut ? (
        <kbd aria-hidden className="ml-auto pl-4 font-mono text-xs text-fg-muted">
          {shortcut === 'x' ? 'x / Del' : shortcut}
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
