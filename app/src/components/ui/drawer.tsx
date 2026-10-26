import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * A navigation drawer (Material's modal drawer): while `drawer`, `children` sit in a panel that slides in
 * from the left over the page when `open`, over a scrim that closes it (as do Escape and following a link
 * inside). Otherwise `children` lay out where they are, as if there were no drawer. Either way they stay
 * mounted, so what they hold (a scroll position, folded groups) is there when the drawer opens.
 */
export function Drawer({
  drawer,
  open,
  onOpenChange,
  label,
  children,
}: {
  drawer: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  children: ReactNode
}) {
  const shown = drawer && open

  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shown, onOpenChange])

  return (
    <>
      {drawer ? (
        <div
          aria-hidden
          onClick={() => onOpenChange(false)}
          className={cn('fixed inset-0 z-40 bg-overlay transition-opacity duration-200', shown ? 'opacity-100' : 'pointer-events-none opacity-0')}
        />
      ) : null}
      <div
        role={drawer ? 'dialog' : undefined}
        aria-modal={shown || undefined}
        aria-label={drawer ? label : undefined}
        inert={drawer && !open}
        onClick={(e) => drawer && (e.target as Element).closest('a[href]') && onOpenChange(false)}
        className={cn(
          drawer
            ? 'fixed inset-y-0 left-0 z-50 flex w-[min(85vw,24rem)] bg-bg shadow-card transition-transform duration-200 ease-out'
            : 'contents',
          drawer && !open && '-translate-x-full',
        )}
      >
        {children}
      </div>
    </>
  )
}
