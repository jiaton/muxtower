import { createDaemonClient } from '@/lib/api/client'
import { useDaemonsStore } from '@/lib/daemons/store'
import { languageOf, spokenIn } from './packs'
import { setHubVoice, useSpeech } from './speech'

const ANSWER_MS = 3000 // a piece's audio, at most this long coming: else the phone's voice
const STATUS_MS = 60_000

/**
 * The hub's voice for Read aloud (`tts/`: Azure's, made on the hub): a piece's mp3 asked of the daemon the
 * session in front is listed under, within three seconds. Used only while that daemon says it has a voice
 * (asked once a minute); otherwise, and on any failure, the phone speaks with its own voice.
 */
let known: { daemonId: string; available: boolean; at: number } | null = null

async function available(daemonId: string): Promise<boolean> {
  if (known && known.daemonId === daemonId && Date.now() - known.at < STATUS_MS) return known.available
  const daemon = useDaemonsStore.getState().daemons.find((d) => d.id === daemonId)
  let ok = false
  if (daemon) {
    try {
      const res = await createDaemonClient(daemon).GET('/v1/tts', { signal: AbortSignal.timeout(ANSWER_MS) })
      ok = Boolean(res.data?.available)
      if (res.data && !ok && res.data.why_not && res.data.why_not !== 'off')
        useSpeech.setState({ note: spokenIn(languageOf(useSpeech.getState().front?.reply ?? '')).phoneVoice })
    } catch {
      ok = false
    }
  }
  known = { daemonId, available: ok, at: Date.now() }
  return ok
}

/** Speaks through the hub of `daemonId` (the session in front's) from now on, when it has a voice. */
export async function chooseHubVoice(daemonId: string | null) {
  if (!daemonId || !(await available(daemonId))) return setHubVoice(null)
  const daemon = useDaemonsStore.getState().daemons.find((d) => d.id === daemonId)
  if (!daemon) return setHubVoice(null)
  useSpeech.setState({ note: null })
  setHubVoice(async (text, language) => {
    const res = await createDaemonClient(daemon).POST('/v1/tts', {
      body: { text, language },
      parseAs: 'blob',
      signal: AbortSignal.timeout(ANSWER_MS),
    })
    if (!res.data) throw new Error('no voice from the hub')
    return res.data as Blob
  })
}

/** Forgets what the hub said of its voice (a setting changed). */
export function recheckHubVoice() {
  known = null
}
