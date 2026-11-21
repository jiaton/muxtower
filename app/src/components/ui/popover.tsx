import * as PopoverPrimitive from '@radix-ui/react-popover'
import type { ReactElement, ReactNode } from 'react'
import { useMediaQuery } from '@/lib/use-media-query'
import { Dialog, DialogContent, DialogTrigger } from './dialog'
import { SHEET_QUERY } from './dropdown-menu'

/** A panel of details opened from a button (`trigger`, an element that takes a ref: a `Button`): on a
 *  desktop a popover beside it (Radix: Esc, a click outside or the trigger again close it; at most 24rem
 *  wide, as tall as the room there, scrolling inside); where a menu opens as a sheet (`SHEET_QUERY`: a
 *  phone) the same content as a bottom sheet with its title and a close button. Not `DropdownMenu`: what
 *  it holds is read (and copied from), not picked. */
export function Popover({ trigger, title, children }: { trigger: ReactElement; title: string; children: ReactNode }) {
  const sheet = useMediaQuery(SHEET_QUERY)
  if (sheet)
    return (
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent title={title}>{children}</DialogContent>
      </Dialog>
    )
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={6}
          align="start"
          collisionPadding={8}
          aria-label={title}
          className="z-[90] flex max-h-[min(var(--radix-popover-content-available-height),36rem)] w-96 max-w-[calc(100vw-16px)] flex-col gap-2 overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-card"
        >
          <h2 className="text-sm font-semibold">{title}</h2>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
