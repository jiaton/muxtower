import { createDaemonClient, unwrap } from '@/lib/api/client'
import { useDaemonsStore } from '@/lib/daemons/store'
import { entryKey } from '@/features/sessions/model/facets'
import { chooseHubVoice } from './hub-voice'
import { languageOf } from './packs'
import { setMediaActions } from './media'
import { errorFields, logMedia } from './media-log'
import { nothingSaid, problemSaid, readAll, sayFound, speak, stopSpeaking, useSpeech } from './speech'

/** Play: the summary of the latest reply of the session in front, said now: kept on the hub, or made there
 *  at once (one summarizer call) when that reply has none yet; the hub answers a kept one without a call. False when there is nothing to say; a reason
 *  said aloud when it cannot be made. */
export async function play(
  target: { daemonId: string; sessionId: string } | null,
  /** `voice`: waited for before saying it (the hub's voice being chosen); `current`: false once stopped
   *  meanwhile, and then nothing is said; `found`: told what the hub answered. */
  {
    voice,
    current = () => true,
    found: keep,
    failed,
  }: {
    voice?: Promise<unknown>
    current?: () => boolean
    found?: (f: { text: string; found: string; language?: string }) => void
    /** Told why it failed (the media log). */
    failed?: (error: unknown) => void
  } = {},
): Promise<boolean> {
  if (!target) return false
  const key = entryKey(target.daemonId, target.sessionId)
  const daemon = useDaemonsStore.getState().daemons.find((d) => d.id === target.daemonId)
  if (!daemon) return false
  try {
    const found = unwrap(
      await createDaemonClient(daemon).POST('/v1/sessions/{session_id}/spoken', { params: { path: { session_id: target.sessionId } } }),
    )
    keep?.({ text: found.text, found: found.reply, language: found.language })
    await voice
    if (!current()) return false
    sayFound(key, found.text, found.reply, found.language)
    return true
  } catch (error) {
    failed?.(error)
    if (!current()) return false
    // The hub says why in a word (unavailable, limit, failed): said in the language of what is there.
    const language = languageOf(useSpeech.getState().front?.reply ?? '')
    speak(problemSaid(error instanceof Error ? error.message : 'failed', language), { language })
    return false
  }
}

/** The summary Play last said per session (`entryKey`), and of which reply (`last_message`): said again
 *  as it is while that reply is still the latest, without asking the hub. */
const said = new Map<string, { reply: string; text: string; found: string; language?: string }>()

let asked = 0 // each Play from the header: one stopped before its summary came says nothing

/** Play from the session's header, Live on or off: the summary of `reply` (the session's latest), said in
 *  the hub's voice when it has one, else the phone's, with the caption and the media controls. Made only
 *  now, on this press: the one already said for this same reply is said again without asking; else the
 *  hub's kept one, or made there (`play`). A tap while it asks or speaks stops it (`stopPlaying`). */
export async function playSession(session: { daemonId: string; sessionId: string; name: string; reply: string }): Promise<boolean> {
  const { daemonId, sessionId, name, reply } = session
  const key = entryKey(daemonId, sessionId)
  const mine = ++asked
  useSpeech.setState({ front: { key, daemonId, sessionId, name, reply }, asking: key })
  const voice = chooseHubVoice(daemonId)
  const kept = said.get(key)
  try {
    if (kept && kept.reply === reply) {
      await voice
      if (mine !== asked) return false
      sayFound(key, kept.text, kept.found, kept.language)
      return true
    }
    return await play({ daemonId, sessionId }, { voice, current: () => mine === asked, found: (f) => said.set(key, { ...f, reply }) })
  } finally {
    if (mine === asked) useSpeech.setState({ asking: null })
  }
}

/** Stops Play: its summary, if still being asked for, is not said; what is being said stops. */
export function stopPlaying() {
  asked += 1
  useSpeech.setState({ asking: null })
  stopSpeaking()
}

/** The session in front, as Play needs it. */
function frontTarget() {
  const front = useSpeech.getState().front
  return front?.daemonId && front.sessionId ? { daemonId: front.daemonId, sessionId: front.sessionId } : null
}

let media = 0 // each media Play: one stopped (or replaced) before its summary came says nothing
let mediaAsking = false

/** A media button's Play: the latest summary of the session in front, or, when there is nothing to play,
 *  said so briefly ("Nothing to read yet"); a failure is said too (`play`). Never silent. */
async function playFromMedia(): Promise<string> {
  const target = frontTarget()
  if (!target) return nothingNow('no session in front')
  if (!useDaemonsStore.getState().daemons.some((d) => d.id === target.daemonId)) return nothingNow('no daemon')
  const mine = ++media
  mediaAsking = true
  let why: unknown = null
  try {
    const ok = await play(target, { current: () => mine === media, failed: (e) => (why = e) })
    if (ok) return 'played'
    if (why) {
      logMedia('play-failed', errorFields(why))
      return `failed: ${errorFields(why).message}`
    }
    return mine === media ? 'nothing' : 'stopped meanwhile'
  } finally {
    if (mine === media) mediaAsking = false
  }
}

function nothingNow(why: string): string {
  speak(nothingSaid(useSpeech.getState().front?.reply ?? ''))
  return `nothing: ${why}`
}

// The phone's media controls (lock screen, a car's steering wheel): play/pause (stop what is said, else
// play its summary), stop, read it all, play it again.
setMediaActions({
  toggle: () => {
    if (useSpeech.getState().speaking || mediaAsking) {
      media += 1
      mediaAsking = false
      stopPlaying()
      return 'stopped'
    }
    return playFromMedia()
  },
  stop: () => {
    media += 1
    mediaAsking = false
    stopPlaying()
    return 'stopped'
  },
  next: () => (readAll() ? 'read all' : nothingNow('no reply')),
  previous: () => playFromMedia(),
})
