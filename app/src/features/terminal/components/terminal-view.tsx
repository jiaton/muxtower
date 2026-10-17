import { ArrowDown, LoaderCircle } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ansiToLines } from '@/lib/ansi'
import { align } from '../lines'

interface Props {
  ansi: string | undefined
  fontSize: number
  /** Asked when the reader nears the top and older output may exist. */
  onNeedMore?: () => void
  loadingMore?: boolean
  /** Called with the cols/rows that fit this view (only when fitting). */
  onFit?: (size: { cols: number; rows: number }) => void
}

const BOTTOM_SLACK = 24

/**
 * The pane's output as selectable text in a natively scrolling box (pixel scrolling with momentum,
 * no tmux copy mode). Each snapshot is diffed line by line against what is shown: lines pushed off
 * the top or older lines added on top are removed/inserted, and the scroll position is corrected by
 * their height so the reader's place never jumps. At the bottom, the view follows new output.
 */
export function TerminalView({ ansi, fontSize, onNeedMore, loadingMore, onFit }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const shown = useRef<string[]>([])
  const atBottom = useRef(true)
  const [behind, setBehind] = useState(false)
  const lines = useMemo(() => (ansi === undefined ? null : ansiToLines(ansi.replace(/\n+$/, ''))), [ansi])

  useLayoutEffect(() => {
    const box = scroller.current
    const el = body.current
    if (!box || !el || !lines) return
    const prev = shown.current
    const { removeTop, insertTop } = align(prev, lines)
    let delta = 0

    for (let i = 0; i < removeTop && el.firstElementChild; i++) {
      delta -= (el.firstElementChild as HTMLElement).offsetHeight
      el.firstElementChild.remove()
    }
    const inserted: HTMLElement[] = []
    for (let i = insertTop - 1; i >= 0; i--) {
      const div = document.createElement('div')
      div.innerHTML = lines[i]
      el.prepend(div)
      inserted.push(div)
    }
    for (const div of inserted) delta += div.offsetHeight

    // What the DOM now holds, line for line, versus what it should hold.
    const current = [...lines.slice(0, insertTop), ...prev.slice(removeTop)]
    const children = el.children
    let changedBelow = removeTop > 0
    for (let i = insertTop; i < lines.length; i++) {
      if (i < children.length) {
        if (current[i] !== lines[i]) {
          children[i].innerHTML = lines[i]
          changedBelow = true
        }
      } else {
        const div = document.createElement('div')
        div.innerHTML = lines[i]
        el.append(div)
        changedBelow = true
      }
    }
    while (children.length > lines.length) {
      el.lastElementChild!.remove()
      changedBelow = true
    }
    shown.current = lines

    if (atBottom.current) box.scrollTop = box.scrollHeight
    else {
      box.scrollTop += delta
      if (changedBelow) setBehind(true)
    }
  }, [lines])

  // Fit: how many characters and lines this box shows at the current font size.
  useEffect(() => {
    const box = scroller.current
    if (!box || !onFit) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const measure = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const char = probe.current!.getBoundingClientRect()
        const style = getComputedStyle(box)
        const width = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        const cols = Math.max(20, Math.floor(width / (char.width / 10)))
        const rows = Math.min(200, Math.max(5, Math.floor(box.clientHeight / char.height)))
        onFit({ cols, rows })
      }, 250)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [onFit, fontSize])

  const onScroll = () => {
    const box = scroller.current!
    atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < BOTTOM_SLACK
    if (atBottom.current) setBehind(false)
    if (box.scrollTop < box.clientHeight && onNeedMore && !loadingMore) onNeedMore()
  }

  return (
    <div className="relative flex h-[70dvh] min-h-72 shrink-0 flex-col overflow-hidden rounded-md bg-terminal-bg">
      {loadingMore ? (
        <p className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 bg-terminal-bg py-1 text-xs text-terminal-fg">
          <LoaderCircle className="size-3 animate-spin" aria-hidden /> Loading older output…
        </p>
      ) : null}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto overscroll-contain p-2 font-mono leading-snug whitespace-pre text-terminal-fg [overflow-anchor:none] [&>div>div]:min-h-[1.375em]"
        style={{ fontSize }}
        role="log"
        aria-label="Session output"
        tabIndex={0}
      >
        <span ref={probe} aria-hidden className="pointer-events-none invisible absolute">
          MMMMMMMMMM
        </span>
        <div ref={body} />
      </div>
      {behind ? (
        <Button
          size="sm"
          variant="secondary"
          className="absolute right-3 bottom-3 shadow-card"
          onClick={() => {
            const box = scroller.current!
            box.scrollTop = box.scrollHeight
            atBottom.current = true
            setBehind(false)
          }}
        >
          <ArrowDown /> New output
        </Button>
      ) : null}
    </div>
  )
}
