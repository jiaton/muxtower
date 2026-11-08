import { AudioLines, Pause, Play, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/use-media-query'
import { pauseLive, resumeLive, stopLive, toggleLive, useLive } from '../live/engine'

const NOTE_KEY = 'muxtower.live.phone-note'
const SHORTCUT = 'Alt+L'

/** Turns Live on or off: hands-free speech into the message box. Alt+L does the same (and resumes it
 *  when paused). */
export function LiveButton() {
  const phase = useLive((s) => s.phase)
  const on = phase !== 'off' && phase !== 'error'
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
      className={cn('shrink-0', on && 'text-accent')}
      aria-label={on ? 'Turn Live off' : 'Turn Live on'}
      aria-pressed={on}
      title={`Live: speak hands-free into the message box (${SHORTCUT})`}
      onPointerDown={(e) => e.preventDefault()} // keep the phone keyboard as it is
      onClick={() => void toggleLive()}
    >
      <AudioLines />
    </Button>
  )
}

/** What Live is doing, over the message box: listening (and hearing speech), paused (a big button to
 *  resume: only a tap or Alt+L does, nothing said is heard), or why it stopped. On a phone, once: it
 *  needs the page in front and the screen on. */
export function LiveBar() {
  const { phase, speaking, pending, error } = useLive()
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
      {phase === 'paused' ? (
        <Button variant="secondary" size="lg" className="w-full" onClick={resumeLive}>
          <Play /> Paused: tap to resume
        </Button>
      ) : (
        <div className="flex items-center gap-2 px-1 text-sm text-fg-muted">
          <span
            aria-hidden
            className={cn(
              'size-2.5 shrink-0 rounded-full',
              phase === 'starting' ? 'bg-state-idle' : 'bg-success',
              speaking && 'animate-pulse',
            )}
          />
          <span className="min-w-0 flex-1 truncate">
            {phase === 'starting'
              ? 'Starting Live…'
              : speaking
                ? 'Hearing you…'
                : 'Listening · say 发送 / send to send, 暂停 / pause to pause'}
            {pending ? ` · transcribing ${pending}` : ''}
          </span>
          {phase === 'listening' ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Pause Live"
              title="Pause: nothing is heard until resumed"
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
