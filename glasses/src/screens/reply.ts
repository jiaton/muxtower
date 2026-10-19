/** A voice reply: hold to talk, release, read what was heard, tap to send it (or hold again to redo). */
import { TEXT_WIDTH } from '@/display/limits'
import type { Screen } from '@/display/screen'
import { columns, wrap } from '@/display/text'
import type { Action } from '@/input/gestures'
import { findSession, type AppState, type Outcome, type Voice } from '@/state/model'

const PHASES: Record<Voice['phase'], { body: string; footer: string }> = {
  listening: { body: 'Listening… release to stop.', footer: 'release to stop' },
  transcribing: { body: 'Turning speech into text…', footer: 'one moment' },
  ready: { body: '', footer: 'tap send · hold redo · 2× cancel' },
  failed: { body: '', footer: 'hold to try again · 2× cancel' },
}

export function replyView(state: AppState, voice: Voice): Screen {
  const name = findSession(state, voice.session)?.name ?? 'session'
  const phase = PHASES[voice.phase]
  const text = voice.phase === 'ready' || voice.phase === 'failed' ? voice.text : phase.body
  return {
    header: columns(['Reply', name], [100], TEXT_WIDTH),
    body: wrap(text || 'Nothing was heard.', TEXT_WIDTH),
    footer: state.notice ?? phase.footer,
  }
}

/** Taps and swipes while a reply is open. Holding (talk) is handled by the controller: it owns the mic. */
export function replyAct(state: AppState, voice: Voice, action: Action): Outcome {
  const { nav } = state
  if (action === 'back') return { nav, voice: null, notice: null }
  if (action === 'select' && voice.phase === 'ready' && voice.text)
    return { nav, voice: null, notice: 'Sending…', command: { type: 'input', id: voice.session, text: voice.text } }
  return { nav }
}
