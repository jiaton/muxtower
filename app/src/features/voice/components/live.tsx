import { AudioLines, Ear, Pause, Play, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/use-media-query'
import { pauseLive, resumeLive, stopLive, toggleLive, useLive } from '../live/engine'
import { chosenLanguages } from '../live/kws'

const NOTE_KEY = 'muxtower.live.phone-note'
const HEARD_MS = 6000 // how long what became of the last thing heard stays
const SHORTCUT = 'Alt+L'

/** Turns Live on or off: hands-free speech into the message box. Alt+L does the same (and resumes it
 *  when paused). */
export function LiveButton() {
  const phase = useLive((s) => s.phase)
  const on = phase !== 'off' && phase !== 'error'
  const commandsOnly = phase === 'paused'
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyL') return
      e.preventDefault() // not the character Option+L types on a Mac
      if (useLive.getState().phase === 'paused') resumeLive()
      else void toggleLive()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <Button
      variant={on ? 'secondary' : 'ghost'}
      size="icon"
      // Writing: the accent and the waveform. Commands only: muted, an ear (it listens, writes nothing).
      className={cn('shrink-0', on && !commandsOnly && 'text-accent', commandsOnly && 'text-fg-muted')}
      aria-label={!on ? 'Turn Live on' : commandsOnly ? 'Live: commands only. Turn Live off' : 'Live: writing. Turn Live off'}
      aria-pressed={on}
      title={
        !on
          ? `Live: speak hands-free into the message box (${SHORTCUT})`
          : commandsOnly
            ? `Live, commands only: nothing is written (${SHORTCUT} writes again)`
            : `Live, writing what you say (${SHORTCUT} turns it off)`
      }
      onPointerDown={(e) => e.preventDefault()} // keep the phone keyboard as it is
      onClick={() => void toggleLive()}
    >
      {commandsOnly ? <Ear /> : <AudioLines />}
    </Button>
  )
}

/** What Live is doing, over the message box, in one of two looks: writing (the accent, what is said goes
 *  into the box) or commands only (paused: muted, an ear, nothing written or uploaded; only "resume" is
 *  heard, or a tap). Loading, transcribing and what became of the last thing heard show within it. On a
 *  phone, once: it needs the page in front and the screen on. */
export function LiveBar() {
  const { phase, speaking, pending, error, commands, heard } = useLive()
  const [, tick] = useState(0)
  useEffect(() => {
    if (!heard) return
    const timer = setTimeout(() => tick((n) => n + 1), HEARD_MS) // then it fades
    return () => clearTimeout(timer)
  }, [heard])
  const recent = heard && Date.now() - heard.at < HEARD_MS ? heard.line : null
  const zh = chosenLanguages().includes('zh')
  const en = chosenLanguages().includes('en')
  const words = (cn: string, english: string) => [zh ? cn : null, en ? english : null].filter(Boolean).join(' / ')
  const mb = (bytes = 0) => (bytes / 1e6).toFixed(1)
  const loading =
    commands.state === 'loading'
      ? commands.received
        ? `Downloading voice commands, ${mb(commands.received)} of ${mb(commands.total)} MB (once)`
        : 'Loading voice commands…'
      : null
  const phone = useMediaQuery('(pointer: coarse)')
  const [note, setNote] = useState(() => {
    try {
      return !localStorage.getItem(NOTE_KEY)
    } catch {
      return false
    }
  })
  useEffect(() => () => void (useLive.getState().phase === 'error' && stopLive()), [])
  if (phase === 'off') return null
  if (phase === 'error') return error ? <Banner tone="error">{error}</Banner> : null
  const dismiss = () => {
    setNote(false)
    try {
      localStorage.setItem(NOTE_KEY, '1')
    } catch {
      // storage blocked: shown again next time
    }
  }
  return (
    <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
      {phone && note ? (
        <Banner tone="info">
          <span className="min-w-0 flex-1">Live works only with this page in front and the screen on.</span>
          <Button variant="ghost" size="icon-sm" aria-label="Got it" onClick={dismiss}>
            <X />
          </Button>
        </Banner>
      ) : null}
      {loading ? <p className="px-1 text-xs text-fg-muted">{loading}</p> : null}
      <p
        aria-label="Last heard"
        className={cn('min-h-4 truncate px-1 text-xs text-fg-muted transition-opacity duration-700', recent ? 'opacity-100' : 'opacity-0')}
      >
        {recent ?? heard?.line ?? ''}
      </p>
      {commands.state === 'off' && commands.note ? (
        <p className="px-1 text-xs text-fg-muted">Voice commands are off ({commands.note}): they are read from what is heard.</p>
      ) : null}
      {phase === 'paused' ? (
        // Commands only: neutral, no accent, no pulse; nothing is written or uploaded.
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            {commands.state === 'ready' ? (
              <Ear className="size-4 shrink-0" aria-hidden />
            ) : (
              <Pause className="size-4 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1">
              {commands.state === 'ready' ? (
                <>
                  <span className="font-medium text-fg">Commands only</span> · say {words('继续', 'resume')} to write again
                </>
              ) : (
                <>
                  <span className="font-medium text-fg">Paused</span> · tap to resume
                </>
              )}
            </span>
          </div>
          <Button variant="secondary" size="lg" className="w-full" onClick={resumeLive}>
            <Play /> {commands.state === 'ready' ? 'Tap to write again' : 'Tap to resume'}
          </Button>
        </div>
      ) : (
        // Writing: the accent, a dot that pulses only while speech is heard.
        <div className="flex items-center gap-2 px-1 text-sm">
          <span
            aria-hidden
            className={cn(
              'size-2.5 shrink-0 rounded-full',
              phase === 'starting' ? 'bg-state-idle' : 'bg-accent',
              speaking && 'animate-pulse',
            )}
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cn('flex min-w-0 items-center gap-1.5 font-medium', phase === 'starting' ? 'text-fg-muted' : 'text-accent')}>
              <AudioLines className="size-4 shrink-0" aria-hidden />
              <span className="truncate">
                {phase === 'starting' ? 'Starting Live…' : speaking ? 'Live · hearing you…' : 'Live · writing what you say'}
              </span>
            </span>
            {phase === 'listening' ? (
              <span className="truncate text-xs text-fg-muted">
                say {words('发送', 'send')} to send, {words('暂停', 'pause')} to stop writing
                {commands.state === 'ready' ? ' · commands on device' : ''}
                {pending ? ` · transcribing ${pending}` : ''}
              </span>
            ) : null}
          </span>
          {phase === 'listening' ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Stop writing (commands only)"
              title="Stop writing: only commands are heard until you resume"
              onClick={pauseLive}
            >
              <Pause />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
