/** A voice reply: talk (held, or from a tap to the next tap) while the text appears, then read the final
 *  text and tap to send it. A double tap cancels at any point. */
import { BODY_LINES, TEXT_WIDTH } from '@/display/limits'
import type { Screen } from '@/display/screen'
import { columns, wrap } from '@/display/text'
import type { Action } from '@/input/gestures'
import { findSession, type AppState, type Outcome, type Voice } from '@/state/model'

const FOOTERS: Record<Voice['phase'], string> = {
  listening: '',
  transcribing: 'finishing…',
  ready: 'tap send · 2× cancel',
  failed: 'tap try again · 2× cancel',
}
const WAITING = { listening: 'Listening…', transcribing: 'Finishing…', ready: 'Nothing was heard.', failed: '' }

export function replyView(state: AppState, voice: Voice): Screen {
  const name = findSession(state, voice.session)?.name ?? 'session'
  const footer =
    voice.phase === 'listening' ? (voice.mode === 'hold' ? 'release to stop · 2× cancel' : 'tap stop · 2× cancel') : FOOTERS[voice.phase]
  const lines = wrap(voice.text || WAITING[voice.phase], TEXT_WIDTH)
  return {
    header: columns(['Reply', name], [100], TEXT_WIDTH),
    body: lines.slice(-BODY_LINES), // while it grows, the newest words stay on screen
    footer: state.notice ?? footer,
  }
}

/** Taps and swipes while a reply is open. Starting and stopping the microphone is the controller's job. */
export function replyAct(state: AppState, voice: Voice, action: Action): Outcome {
  const { nav } = state
  if (action === 'back') return { nav, voice: null, notice: null }
  if (action !== 'select') return { nav }
  if (voice.phase === 'listening') return { nav, listen: 'stop' }
  if (voice.phase === 'failed') return { nav, listen: 'start' }
  if (voice.phase === 'ready' && voice.text)
    return { nav, voice: null, notice: 'Sending…', command: { type: 'input', id: voice.session, text: voice.text } }
  return { nav }
}
