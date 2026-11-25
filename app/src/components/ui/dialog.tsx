import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

/** Whether Esc is for a popup inside the dialog rather than the dialog: it comes from a field whose list is
 *  open (a suggestion list, the mention menu: `aria-expanded`). That field closes its list; the next Esc
 *  closes the dialog. (The dialog hears Esc first, before the field: it listens on the page, capturing.) */
export const escapeForPopup = (target: EventTarget | null) =>
  target instanceof Element && target.matches('input, textarea, [role="combobox"]') && target.getAttribute('aria-expanded') === 'true'

// The last control focused outside menus and dialogs: where focus goes back to when a dialog opened from a
// menu closes (the menu item that opened it is gone, and the page itself would get focus otherwise).
let lastOutside: HTMLElement | null = null
if (typeof document !== 'undefined')
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target
      if (t instanceof HTMLElement && t.tabIndex >= 0 && !t.closest('[role="menu"], [role="dialog"]')) lastOutside = t
    },
    true,
  )

/** Where focus goes back to when a dialog opening now closes: what had it, else (opened from a menu) the
 *  control the menu was opened from. */
export function returnTarget(): HTMLElement | null {
  const now = document.activeElement
  const usable = now instanceof HTMLElement && now !== document.body && !now.closest('[role="menu"]') && now.tabIndex >= 0
  return usable ? null : lastOutside // null: Radix's own (what had focus) is right
}

/** Bottom sheet on phones, centered dialog from `sm` up. Esc closes it, its edits dropped (a dialog keeps
 *  nothing it was not told to save), except while a list inside it is open: then only the list. */
export function DialogContent({
  className,
  title,
  description,
  children,
  onEscapeKeyDown,
  onCloseAutoFocus,
  titleIcon,
  fill = false,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  /** A list that runs edge to edge under the title (rows ruled across): no side padding around it, the list
   *  scrolling on its own, the sheet tall on a phone. */
  fill?: boolean
  title: string
  description?: ReactNode
  /** Stands before the title (a project's colour dot). */
  titleIcon?: ReactNode
}) {
  const [returnTo] = useState(returnTarget)
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-overlay" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-[80] flex max-h-[90dvh] flex-col gap-4 overflow-y-auto rounded-t-lg border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg',
          fill && 'h-[85dvh] gap-2 overflow-hidden px-0 pb-0 sm:h-auto sm:max-h-[80dvh]',
          className,
        )}
        onEscapeKeyDown={(e) => {
          onEscapeKeyDown?.(e)
          if (escapeForPopup(e.target)) e.preventDefault()
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e)
          if (e.defaultPrevented || !returnTo?.isConnected) return
          e.preventDefault()
          returnTo.focus()
        }}
        {...props}
      >
        <div className={cn('flex items-start gap-3', fill && 'px-5')}>
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="flex items-center gap-2 text-lg font-semibold">
              {titleIcon}
              <span className="min-w-0 truncate">{title}</span>
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-fg-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="rounded-md p-1 text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </DialogPrimitive.Close>
        </div>
        {fill ? <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{children}</div> : children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
