import { AudioLines, BookOpenText, Ear, Pause, Play, Square, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/use-media-query'
import { cancelArmedSend, pauseLive, resumeLive, sendFromKey, stopLive, toggleLive, useLive } from '../live/engine'
import { feedbackOf, liveDetails } from '../live/feedback'
import { readAll, stopSpeaking, useSpeech } from '../live/speech'
import { play } from '../live/play'
import { chooseHubVoice } from '../live/hub-voice'
import { ReadAloudCaption } from './read-aloud-caption'
import type { Command } from '../live/commands'
import { enabledPacks } from '../live/packs'
import { composerColumns } from '@/components/ui/bar'
import { Dot } from '@/components/ui/indicators'
import { ink, liveRow, look } from '@/components/ui/intents'
import { keepFocus } from '@/components/ui/gesture'

const NOTE_KEY = 'muxtower.live.phone-note'
const FEEDBACK_MS = 2000 // how long what became of the last thing heard stays in place of the hint
const SHORTCUT = 'Alt+L'
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
/** Sends while Live is on, from anywhere on the page (`sendKey`). */
export const SEND_KEYS = MAC ? '⌘↵' : 'Ctrl+↵'

/** ⌘↵ (Ctrl+Enter off a Mac), never with Shift or Alt, sends while Live is on, wherever focus is on the
 *  session page: in the message box, or nowhere in particular. Not in another field (a dialog's, a rename,
 *  a new session's first message, where it is that form's own), nor while a dialog is open. */
export function sendKey(e: KeyboardEvent): boolean {
  const command = MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  if (!command || e.shiftKey || e.altKey || (e.code !== 'Enter' && e.code !== 'NumpadEnter')) return false
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false
  const at = document.activeElement as HTMLElement | null
  const editable = at && (at.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName))
  if (editable && at.getAttribute('aria-label') !== 'Message the agent') return false
  return sendFromKey()
}

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
    // Before the message box's own keys (capture): with Live on, ⌘↵ there waits for speech still landing.
    const onSend = (e: KeyboardEvent) => {
      // Esc lets a ⌘↵ that waits for the speech go (nothing sent), unless a dialog takes Esc.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"], [role="alertdialog"]') && cancelArmedSend()) {
        e.preventDefault()
        return
      }
      if (!sendKey(e)) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onSend, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onSend, true)
    }
  }, [])
  return (
    <Button
      variant={on ? 'secondary' : 'ghost'}
      size="icon"
      // Writing: the accent and the waveform. Commands only: muted, an ear (it listens, writes nothing).
      tone={commandsOnly ? 'muted' : on ? 'accent' : undefined}
      className="shrink-0"
      aria-label={!on ? 'Turn Live on' : commandsOnly ? 'Live: commands only. Turn Live off' : 'Live: writing. Turn Live off'}
      aria-pressed={on}
      title={
        !on
          ? `Live: speak hands-free into the message box (${SHORTCUT})`
          : commandsOnly
            ? `Live, commands only: nothing is written (${SHORTCUT} writes again)`
            : `Live, writing what you say: ${SEND_KEYS} sends (${SHORTCUT} turns it off)`
      }
      onPointerDown={keepFocus} // keep the phone keyboard as it is
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
export function LiveBar({
  daemonId = '',
  sessionId = '',
  reply = null,
  name = '',
}: {
  daemonId?: string
  sessionId?: string
  /** The session's latest reply: Play and Read all have something to say. */
  reply?: string | null
  /** The session's name: whose words the caption and the phone's media controls show. */
  name?: string
}) {
  const { phase, speaking, pending, then, error, commands, heard } = useLive()
  const readAloud = useSpeech((s) => s.readAloud)
  const setReadAloud = useSpeech((s) => s.setReadAloud)
  const talking = useSpeech((s) => s.speaking)
  const key = `${daemonId}/${sessionId}`
  const isNew = useSpeech((s) => Boolean(s.unheard[key]))
  const voiceNote = useSpeech((s) => s.note)
  // Whose voice: the hub's (its daemon's, when it has one), else the phone's.
  useEffect(() => {
    if (readAloud) void chooseHubVoice(daemonId || null)
  }, [readAloud, daemonId])
  // The session in front and its latest reply: what Play and Read all are about.
  useEffect(() => {
    useSpeech.setState({ front: { key, daemonId, sessionId, name, reply: reply ?? null } })
    return () => {
      useSpeech.setState({ front: null })
    }
  }, [key, reply, daemonId, sessionId, name])
  const big = readAloud && phase !== 'starting'
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
  if (phase === 'error')
    return error ? (
      <Banner tone="error" aligned>
        {error}
      </Banner>
    ) : null
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
        phase === 'listening' ? `say ${say('send')}${phone ? '' : ` or ${SEND_KEYS}`} to send, ${say('pause')} to stop writing` : null,
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
        ? `Live · hearing you…${then === 'send' ? ' then sending' : ''}`
        : pending
          ? `Live · writing…${pending > 1 ? ` (${pending})` : ''}${then === 'send' ? ' then sending' : ''}`
          : 'Live · speak to write'
  return (
    <>
      {phone && note ? (
        <Banner
          tone="info"
          aligned
          action={
            <Button variant="ghost" size="icon-sm" aria-label="Got it" onClick={dismiss}>
              <X />
            </Button>
          }
        >
          <span className="min-w-0 flex-1">Live works only with this page in front and the screen on.</span>
        </Banner>
      ) : null}
      {/* One row, its height set by its one line: nothing appears or disappears around it. Lined up with the
          message box (its + column, then where its text starts), its box the same in every state: its border
          only shows while paused. */}
      {/* The caption floats above this row (out of the flow: nothing moves). */}
      <div className="relative">
        {readAloud ? <ReadAloudCaption /> : null}
        <div role="status" aria-live="polite" className={liveRow({ paused })}>
          <span aria-hidden className={cn(composerColumns.leadInBox, 'gap-1')}>
            {paused ? (
              commands.state === 'ready' ? (
                <Ear className="size-4" />
              ) : (
                <Pause className="size-4" />
              )
            ) : (
              <>
                <Dot tone={phase === 'starting' ? 'idle' : 'accent'} pulse={speaking} />
                <AudioLines className={cn('size-4', phase === 'starting' ? ink.quiet : ink.accent)} />
              </>
            )}
          </span>
          <span className={cn('flex min-w-0 flex-1 items-center gap-2', composerColumns.inset, paused && 'pr-1')}>
            <span className={cn('shrink-0', paused ? ink.strong : phase === 'starting' ? ink.quiet : ink.highlight)}>{title}</span>
            <span className={cn('min-w-0 flex-1 truncate', feedback ? ink.normal : ink.meta)} title={feedback ?? hint}>
              {feedback ?? (hint ? `· ${hint}` : '')}
            </span>
            {paused ? (
              <Button variant="secondary" size="sm" className="shrink-0" onClick={resumeLive}>
                <Play /> {commands.state === 'ready' ? 'Write again' : 'Resume'}
              </Button>
            ) : null}
          </span>
          {/* Its pause in the send button's column, like a banner's close; Read aloud beside it. */}
          {phase === 'listening' || paused ? (
            <span className={composerColumns.trails}>
              <Button
                variant="ghost"
                size={big ? 'icon' : 'icon-sm'}
                aria-pressed={readAloud}
                tone={readAloud ? 'accent' : undefined}
                aria-label={readAloud ? 'Read aloud: on. Turn it off' : 'Read aloud: say each turn of this session when it ends'}
                title={
                  readAloud ? 'Read aloud: on (停 / stop, 再说一遍 / say again, 读全文 / read all)' : 'Read aloud each turn when it ends'
                }
                onClick={() => setReadAloud(!readAloud)}
              >
                {readAloud ? <Volume2 /> : <VolumeX />}
              </Button>
              {!paused ? (
                <Button
                  variant="ghost"
                  size={big ? 'icon' : 'icon-sm'}
                  aria-label="Stop writing (commands only)"
                  title="Stop writing: only commands are heard until you resume"
                  onClick={pauseLive}
                >
                  <Pause />
                </Button>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
      {big ? (
        // Read aloud: what it can do, big enough to hit without looking long.
        <div className="flex flex-wrap gap-2 px-2 pb-1" role="group" aria-label="Read aloud">
          {voiceNote ? <p className={`${ink.meta} w-full`}>{voiceNote}</p> : null}
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            disabled={!reply}
            onClick={() => void play({ daemonId, sessionId })}
            onPointerDown={keepFocus}
          >
            <Play /> Play{isNew ? <span className={look.tag}>new</span> : null}
          </Button>
          <Button variant="secondary" size="lg" className="flex-1" disabled={!reply} onClick={readAll} onPointerDown={keepFocus}>
            <BookOpenText /> Read all
          </Button>
          <Button variant="secondary" size="lg" className="flex-1" disabled={!talking} onClick={stopSpeaking} onPointerDown={keepFocus}>
            <Square /> Stop
          </Button>
        </div>
      ) : null}
    </>
  )
}
