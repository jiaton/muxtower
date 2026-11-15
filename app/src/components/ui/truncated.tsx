import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

const GUTTER = 8

/**
 * Text kept to one line (or `lines` lines) with an ellipsis, and, only when it is cut, its whole text in a
 * tooltip at once (no delay, unlike the browser's `title`) while it is pointed at or its item has focus (a
 * menu item highlighted from the keyboard: the item, not the text, takes focus).
 */
export function Truncated({ children, lines = 1, className }: { children: ReactNode; lines?: 1 | 2; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [tip, setTip] = useState<DOMRect | null>(null)

  useEffect(() => {
    const text = ref.current
    if (!text) return
    const host = text.closest<HTMLElement>('[role^="menuitem"], button, a') ?? text
    const show = () => {
      const cut = text.scrollWidth > text.clientWidth + 1 || text.scrollHeight > text.clientHeight + 1
      setTip(cut ? text.getBoundingClientRect() : null)
    }
    const hide = () => setTip(null)
    host.addEventListener('pointerenter', show)
    host.addEventListener('pointerleave', hide)
    host.addEventListener('focus', show)
    host.addEventListener('blur', hide)
    return () => {
      host.removeEventListener('pointerenter', show)
      host.removeEventListener('pointerleave', hide)
      host.removeEventListener('focus', show)
      host.removeEventListener('blur', hide)
    }
  }, [])

  return (
    <>
      <span ref={ref} className={cn('min-w-0', lines === 2 ? 'line-clamp-2 break-words' : 'truncate', className)}>
        {children}
      </span>
      {tip
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[100] max-w-[min(28rem,calc(100vw-16px))] rounded-md bg-fg px-2 py-1 text-xs whitespace-normal text-bg shadow-card"
              style={{ left: Math.max(GUTTER, Math.min(tip.left, window.innerWidth - GUTTER - 200)), top: tip.bottom + 4 }}
            >
              {children}
            </span>,
            document.body,
          )
        : null}
    </>
  )
}
