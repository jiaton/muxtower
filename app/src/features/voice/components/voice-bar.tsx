import { ArrowUp, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { Dictation } from '../hooks/use-dictation'
import { MAX_SECONDS } from '../hooks/use-recorder'
import { textRole } from '@/components/ui/styles'

const BARS = 48 // the last ~2.4 s of loudness, newest on the right
const TICK_MS = 50
const BAR_WIDTH = 3
const MIN_BAR = 2

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

/** Draws the levels as rounded bars in the canvas's own text color, sized to its box. */
function draw(canvas: HTMLCanvasElement, levels: Float32Array, newest: number) {
  const ratio = window.devicePixelRatio || 1
  const { clientWidth: width, clientHeight: height } = canvas
  if (canvas.width !== Math.round(width * ratio)) [canvas.width, canvas.height] = [width * ratio, height * ratio]
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = getComputedStyle(canvas).color
  const step = width / BARS
  for (let i = 0; i < BARS; i++) {
    const level = levels[(newest + 1 + i) % BARS]
    const bar = Math.max(MIN_BAR, level * height)
    ctx.beginPath()
    ctx.roundRect(i * step + (step - BAR_WIDTH) / 2, (height - bar) / 2, BAR_WIDTH, bar, BAR_WIDTH / 2)
    ctx.fill()
  }
}

/** The message box while speaking, as in Claude's apps: cancel, a live waveform with the time, and send
 *  to text. Its ticks draw straight to a canvas and a span (no re-render); at MAX_SECONDS it finishes. */
export function VoiceBar({ dictation }: { dictation: Dictation }) {
  const { level, transcribing, cancel: onCancel, finish: onDone } = dictation
  const canvas = useRef<HTMLCanvasElement>(null)
  const time = useRef<HTMLSpanElement>(null)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (transcribing) return
    const levels = new Float32Array(BARS)
    const started = performance.now()
    let newest = BARS - 1
    const tick = setInterval(() => {
      newest = (newest + 1) % BARS
      levels[newest] = level()
      if (canvas.current) draw(canvas.current, levels, newest)
      const seconds = (performance.now() - started) / 1000
      if (time.current) time.current.textContent = clock(seconds)
      if (seconds >= MAX_SECONDS) done.current()
    }, TICK_MS)
    return () => clearInterval(tick)
  }, [level, transcribing])

  return (
    <div
      role="group"
      aria-label={transcribing ? 'Transcribing' : 'Recording'}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-surface py-1 pr-1 pl-1"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 rounded-full"
        aria-label="Cancel"
        disabled={transcribing}
        onClick={onCancel}
      >
        <X />
      </Button>
      {transcribing ? (
        <p className={`${textRole.hint} flex min-w-0 flex-1 items-center gap-2`}>
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Transcribing…
        </p>
      ) : (
        <>
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden />
          <canvas ref={canvas} className="h-7 min-w-0 flex-1 text-accent" aria-hidden />
          <span ref={time} className={`${textRole.meta} shrink-0 tabular-nums`}>
            0:00
          </span>
        </>
      )}
      <Button size="icon-sm" className="shrink-0 rounded-full" aria-label="Done: to text" disabled={transcribing} onClick={onDone}>
        <ArrowUp />
      </Button>
    </div>
  )
}
