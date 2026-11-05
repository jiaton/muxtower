import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

/** Bottom sheet on phones, centered dialog from `sm` up. */
export function DialogContent({
  className,
  title,
  description,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-overlay" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-[80] flex max-h-[90dvh] flex-col gap-4 overflow-y-auto rounded-t-lg border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg',
          className,
        )}
        {...props}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
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
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
