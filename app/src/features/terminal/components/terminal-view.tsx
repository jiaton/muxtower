import { ArrowDown, MoveHorizontal } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { countRender } from '@/lib/diagnostics'
import { Button } from '@/components/ui/button'
import { ansiToLines } from '@/lib/ansi'
import { MAX_ROWS } from '../hooks/use-session-terminal'
import { align, collapseGap } from '../lines'
import { useTerminalPrefs } from '../store'
import { Spinner } from '@/components/ui/indicators'
import { look } from '@/components/ui/intents'
import { FitGuard, KeyboardProofHeight } from '../fit-guard'

interface Props {
  ansi: string | undefined
  fontSize: number
  /** Asked when the reader nears the top and older output may exist. */
  onNeedMore?: () => void
  loadingMore?: boolean
  /** Called with the cols/rows that fit this view (only when fitting). */
  onFit?: (size: { cols: number; rows: number }) => void
  /** Offered when lines are wider than the view and it is not fitting: turn fitting on. */
  onFitRequest?: () => void
}

const BOTTOM_SLACK = 24
/** A change of this many rows or fewer (a bar shown over the view a moment: Live's) neither lays the
 *  lines out again nor resizes the pane (which has the agent repaint its whole screen): the view just stays
 *  at the bottom. A real change (the keyboard, the window) is more. */
/** Lines pushed off the top kept in place while the reader is scrolled up, at most. */
const KEPT_ABOVE = 2000
/**
 * The pane's output as selectable text in a natively scrolling scrollBox (pixel scrolling with momentum,
 * no tmux copy mode). Each snapshot is diffed line by line against what is shown: lines pushed off
 * the top or older lines added on top are removed/inserted, and the scroll position is corrected by
 * their height so the reader's place never jumps. At the bottom, the view follows new output.
 */
export function TerminalView({ ansi, fontSize, onNeedMore, loadingMore, onFit, onFitRequest }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLDivElement>(null)
  const shown = useRef<string[]>([])
  const above = useRef(0) // lines pushed off the top, still shown above `shown` while the reader is scrolled up
  const atBottom = useRef(true)
  const [behind, setBehind] = useState(false)
  const [tooWide, setTooWide] = useState(false)
  const drawing = useRef(0) // when the screen now drawn arrived (`lib/diagnostics`: how long drawing takes)
  const [viewRows, setViewRows] = useState<number | undefined>(undefined) // measured while fitting
  const screens = useTerminalPrefs((s) => s.screens) // a fitted pane is this many views tall
  const lines = useMemo(() => {
    drawing.current = performance.now()
    // A pane taller than the view: its blank middle is shortened to fit (`collapseGap`), before aligning.
    const all = ansi === undefined ? null : ansiToLines(ansi.replace(/\n+$/, ''))
    return all && onFit && viewRows ? collapseGap(all, viewRows, Math.min(MAX_ROWS, viewRows * screens)) : all
  }, [ansi, viewRows, onFit, screens])

  useLayoutEffect(() => {
    const scrollBox = scroller.current
    const el = body.current
    if (!scrollBox || !el || !lines) return
    const prev = shown.current
    const { removeTop, insertTop } = align(prev, lines)
    let delta = 0

    // Lines pushed off the top: gone at once at the bottom. Scrolled up, they stay where they are, so the
    // reader's place does not move and nothing writes the scroll position mid-gesture (which stops a
    // trackpad's or a phone's momentum); they go once the reader is back at the bottom.
    const keep = !atBottom.current && insertTop === 0 && above.current + removeTop <= KEPT_ABOVE
    if (keep) above.current += removeTop
    else {
      for (let i = 0; i < above.current + removeTop && el.firstElementChild; i++) {
        delta -= (el.firstElementChild as HTMLElement).offsetHeight
        el.firstElementChild.remove()
      }
      above.current = 0
    }
    const top = above.current // children before the lines of `lines`
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
      if (top + i < children.length) {
        if (current[i] !== lines[i]) {
          children[top + i].innerHTML = lines[i]
          changedBelow = true
        }
      } else {
        const div = document.createElement('div')
        div.innerHTML = lines[i]
        el.append(div)
        changedBelow = true
      }
    }
    while (children.length > top + lines.length) {
      el.lastElementChild!.remove()
      changedBelow = true
    }
    shown.current = lines

    setTooWide(scrollBox.scrollWidth > scrollBox.clientWidth + 2)
    if (atBottom.current) scrollBox.scrollTop = scrollBox.scrollHeight
    else {
      if (delta) scrollBox.scrollTop += delta // only a real correction: a write mid-gesture stops its momentum
      if (changedBelow) setBehind(true)
    }
  }, [lines])

  // Fit: how many cells across and lines down this scrollBox shows at the current font size, measured again
  // when the scrollBox resizes or fonts arrive. The probe is one line of ten cells in the same font and line
  // height as the output (whose non-ASCII text is boxed to its cells, see lib/ansi.ts).
  useLayoutEffect(() => {
    if (lines) countRender(performance.now() - drawing.current) // after the one above has drawn it
  }, [lines])

  useEffect(() => {
    const scrollBox = scroller.current
    if (!scrollBox || !onFit) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const guard = new FitGuard() // never the same size twice, never bouncing between two
    const keyboard = new KeyboardProofHeight() // a phone's keyboard coming and going never resizes the pane
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
    const measure = () => {
      // At the bottom, it stays there through the change at once (not a moment later, its last lines hidden).
      if (atBottom.current) scrollBox.scrollTop = scrollBox.scrollHeight
      clearTimeout(timer)
      timer = setTimeout(() => {
        const line = probe.current!.getBoundingClientRect()
        const style = getComputedStyle(scrollBox)
        const width = scrollBox.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        const height = scrollBox.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        const cols = Math.max(20, Math.floor((width - 1) / (line.width / 10)))
        const fitted = keyboard.height(Math.round(width), height, touch)
        const rows = Math.min(200, Math.max(5, Math.floor(fitted / line.height)))
        if (!guard.allow({ cols, rows })) return
        setViewRows(rows)
        onFit({ cols, rows })
      }, 250)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scrollBox)
    document.fonts?.addEventListener('loadingdone', measure)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      document.fonts?.removeEventListener('loadingdone', measure)
    }
  }, [onFit, fontSize])

  const onScroll = () => {
    const scrollBox = scroller.current!
    atBottom.current = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight < BOTTOM_SLACK
    if (atBottom.current) setBehind(false)
    if (scrollBox.scrollTop < scrollBox.clientHeight && onNeedMore && !loadingMore) onNeedMore()
  }

  return (
    <div className={`${look.terminal} relative flex min-h-0 flex-1 flex-col overflow-hidden`}>
      {loadingMore ? (
        <p className={`${look.terminalNote} absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 py-1`}>
          <Spinner className="size-3" /> Loading older output…
        </p>
      ) : null}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto overscroll-y-contain [scrollbar-gutter:stable] p-2 font-mono leading-snug whitespace-pre text-terminal-fg [-webkit-text-size-adjust:none] [overflow-anchor:none] [text-size-adjust:none] [&>div>div]:min-h-[1.375em]"
        style={{ fontSize }}
        role="log"
        aria-label="Session output"
        tabIndex={0}
      >
        <div ref={probe} aria-hidden className="pointer-events-none invisible absolute w-max">
          MMMMMMMMMM
        </div>
        <div ref={body} />
      </div>
      {tooWide && onFitRequest && !onFit ? (
        <Button size="sm" variant="secondary" floating className="absolute top-2 right-3" onClick={onFitRequest}>
          <MoveHorizontal /> Fit width
        </Button>
      ) : null}
      {behind ? (
        <Button
          size="sm"
          variant="secondary"
          floating
          className="absolute right-3 bottom-3"
          onClick={() => {
            const scrollBox = scroller.current!
            scrollBox.scrollTop = scrollBox.scrollHeight
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
