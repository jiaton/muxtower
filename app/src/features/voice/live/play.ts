import { createDaemonClient, unwrap } from '@/lib/api/client'
import { useDaemonsStore } from '@/lib/daemons/store'
import { entryKey } from '@/features/sessions/model/facets'
import { languageOf } from './packs'
import { problemSaid, readAll, sayFound, setMediaActions, speak, stopSpeaking, useSpeech } from './speech'

/** Play: the summary of the latest reply of the session in front, said now: kept on the hub, or made there
 *  at once (one summarizer call) when that reply has none yet; the hub answers a kept one without a call. False when there is nothing to say; a reason
 *  said aloud when it cannot be made. */
export async function play(target: { daemonId: string; sessionId: string } | null): Promise<boolean> {
  if (!target) return false
  const key = entryKey(target.daemonId, target.sessionId)
  const daemon = useDaemonsStore.getState().daemons.find((d) => d.id === target.daemonId)
  if (!daemon) return false
  try {
    const found = unwrap(
      await createDaemonClient(daemon).POST('/v1/sessions/{session_id}/spoken', { params: { path: { session_id: target.sessionId } } }),
    )
    sayFound(key, found.text, found.reply, found.language)
    return true
  } catch (error) {
    // The hub says why in a word (unavailable, limit, failed): said in the language of what is there.
    const language = languageOf(useSpeech.getState().front?.reply ?? '')
    speak(problemSaid(error instanceof Error ? error.message : 'failed', language), { language })
    return false
  }
}

/** The session in front, as Play needs it. */
function frontTarget() {
  const front = useSpeech.getState().front
  return front?.daemonId && front.sessionId ? { daemonId: front.daemonId, sessionId: front.sessionId } : null
}

// The phone's media controls (lock screen, a car's steering wheel): play its summary, stop, read it all,
// play it again.
setMediaActions({
  play: () => void play(frontTarget()),
  stop: stopSpeaking,
  next: () => void readAll(),
  previous: () => void play(frontTarget()),
})
