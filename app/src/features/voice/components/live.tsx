import { AudioLines, Ear, Pause, Play, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/use-media-query'
import { pauseLive, resumeLive, stopLive, toggleLive, useLive } from '../live/engine'
import { feedbackOf, liveDetails } from '../live/feedback'
import type { Command } from '../live/commands'
import { enabledPacks } from '../live/packs'

const NOTE_KEY = 'muxtower.live.phone-note'
const FEEDBACK_MS = 2000 // how long what became of the last thing heard stays in place of the hint
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

/** What Live is doing, over the message box, in one row that never grows: writing (the accent, what is
 *  said goes into the box; its title follows the moment: speak to write, hearing you, writing…) or commands only (paused: muted, an ear, nothing written or uploaded; only
 *  "resume" is heard, or a tap). After its title, a hint; for a moment after something is heard, what
 *  became of it instead ("✓ sent", "nothing to send"), then the hint again. Loading, downloading and
 *  transcribing take the hint's place. On a phone, once: it needs the page in front and the screen on. */
export function LiveBar() {
  const { phase, speaking, pending, then, error, commands, heard } = useLive()
  const [, tick] = useState(0)
  useEffect(() => {
    if (!heard) return
    const timer = setTimeout(() => tick((n) => n + 1), FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [heard])
  const feedback = heard && Date.now() - heard.at < FEEDBACK_MS ? feedbackOf(heard.event, liveDetails()) : null
  // A command as its words in the languages chosen ("send", or one per language, joined by " / ").
  const say = (command: Command) =>
    enabledPacks()
      .map((p) => p.say[command])
      .join(' / ')
  const mb = (bytes = 0) => (bytes / 1e6).toFixed(1)
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
  const status =
    commands.state === 'loading'
      ? commands.received
        ? `downloading voice commands, ${mb(commands.received)} of ${mb(commands.total)} MB (once)`
        : 'loading voice commands…'
      : commands.state === 'off' && commands.note
        ? `voice commands off: ${commands.note}`
        : null
  const paused = phase === 'paused'
  const hint = paused
    ? commands.state === 'ready'
      ? `say ${say('resume')} to write again`
      : 'tap to resume'
    : [
        phase === 'listening' ? `say ${say('send')} to send, ${say('pause')} to stop writing` : null,
        status ?? (commands.state === 'ready' && phase === 'listening' ? 'commands on device' : null),
      ]
        .filter(Boolean)
        .join(' · ')
  const title = paused
    ? commands.state === 'ready'
      ? 'Commands only'
      : 'Paused'
    : phase === 'starting'
      ? 'Starting Live…'
      : speaking
        ? 'Live · hearing you…'
        : pending
          ? `Live · writing…${pending > 1 ? ` (${pending})` : ''}${then === 'send' ? ' then sending' : ''}`
          : 'Live · speak to write'
  return (
    <div className="flex flex-col gap-1.5">
      {phone && note ? (
        <Banner tone="info">
          <span className="min-w-0 flex-1">Live works only with this page in front and the screen on.</span>
          <Button variant="ghost" size="icon-sm" aria-label="Got it" onClick={dismiss}>
            <X />
          </Button>
        </Banner>
      ) : null}
      {/* One row, its height set by its one line: nothing appears or disappears around it. */}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'flex h-10 items-center gap-2 rounded-md px-2 text-sm',
          paused ? 'border border-border bg-surface-muted text-fg-muted' : 'text-fg-muted',
        )}
      >
        {paused ? (
          commands.state === 'ready' ? (
            <Ear className="size-4 shrink-0" aria-hidden />
          ) : (
            <Pause className="size-4 shrink-0" aria-hidden />
          )
        ) : (
          <>
            <span
              aria-hidden
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                phase === 'starting' ? 'bg-state-idle' : 'bg-accent',
                speaking && 'animate-pulse',
              )}
            />
            <AudioLines className={cn('size-4 shrink-0', phase === 'starting' ? 'text-fg-muted' : 'text-accent')} aria-hidden />
          </>
        )}
        <span className={cn('shrink-0 font-medium', paused ? 'text-fg' : phase === 'starting' ? 'text-fg-muted' : 'text-accent')}>
          {title}
        </span>
        <span className={cn('min-w-0 flex-1 truncate', feedback ? 'text-fg' : 'text-xs')} title={feedback ?? hint}>
          {feedback ?? (hint ? `· ${hint}` : '')}
        </span>
        {paused ? (
          <Button variant="secondary" size="sm" className="shrink-0" onClick={resumeLive}>
            <Play /> {commands.state === 'ready' ? 'Write again' : 'Resume'}
          </Button>
        ) : phase === 'listening' ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label="Stop writing (commands only)"
            title="Stop writing: only commands are heard until you resume"
            onClick={pauseLive}
          >
            <Pause />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
