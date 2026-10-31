import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** A phone drawn around its screen: what the demo app runs in. The screen is 375 × 760 CSS pixels on a
 *  wide page and fills the width (to a phone's height) on a narrow one. */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative mx-auto w-full max-w-[24.5rem] rounded-device border border-border bg-terminal-bg px-2.5 pt-6 pb-2.5 shadow-device',
        className,
      )}
    >
      <div aria-hidden className="absolute top-2.5 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-sm bg-term-0" />
      <div className="relative h-[min(47.5rem,82dvh)] overflow-hidden rounded-screen bg-bg">{children}</div>
    </div>
  )
}
