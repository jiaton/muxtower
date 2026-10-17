import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { ArrowDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { tokenColor } from '@/lib/css-color'

/**
 * Read-only render of the pane's screen (ANSI + scrollback). Every frame is a full snapshot, so the
 * terminal is redrawn from scratch; while the user has scrolled up, redraws pause so the text they are
 * reading does not jump, and a button brings them back to live.
 */
export function TerminalView({ ansi, onSize }: { ansi: string | undefined; onSize?: (size: { cols: number; rows: number }) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const following = useRef(true)
  const pending = useRef<string | undefined>(undefined)
  const [paused, setPaused] = useState(false)

  const draw = (text: string | undefined) => {
    const t = term.current
    if (!t || text === undefined) return
    t.reset()
    t.write(text.replaceAll('\n', '\r\n'), () => t.scrollToBottom())
  }

  useEffect(() => {
    const t = new Terminal({
      convertEol: false,
      disableStdin: true,
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono'),
      fontSize: window.innerWidth < 640 ? 12 : 13,
      scrollback: 5000,
      theme: { background: tokenColor('--color-terminal-bg'), foreground: tokenColor('--color-terminal-fg') },
    })
    const fit = new FitAddon()
    t.loadAddon(fit)
    t.open(host.current!)
    term.current = t
    const resize = () => {
      fit.fit()
      onSize?.({ cols: t.cols, rows: t.rows })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host.current!)
    const scroll = t.onScroll(() => {
      const atBottom = t.buffer.active.viewportY >= t.buffer.active.baseY
      following.current = atBottom
      setPaused(!atBottom)
      if (atBottom && pending.current !== undefined) {
        draw(pending.current)
        pending.current = undefined
      }
    })
    return () => {
      scroll.dispose()
      observer.disconnect()
      t.dispose()
      term.current = null
    }
    // onSize is read once on mount and on container resizes; it is not a redraw trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (following.current) draw(ansi)
    else pending.current = ansi
  }, [ansi])

  return (
    <div className="relative min-h-[50dvh] flex-1 overflow-hidden rounded-md bg-terminal-bg p-2">
      <div ref={host} className="size-full" />
      {paused ? (
        <Button
          size="sm"
          variant="secondary"
          className="absolute right-3 bottom-3 shadow-card"
          onClick={() => {
            following.current = true
            setPaused(false)
            draw(pending.current ?? ansi)
            pending.current = undefined
          }}
        >
          <ArrowDown /> Live
        </Button>
      ) : null}
    </div>
  )
}
