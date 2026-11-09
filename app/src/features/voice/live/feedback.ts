import type { Heard } from './pipeline'

/**
 * What the Live status row says about something heard, for a moment, in place of its hint: a command done
 * ("✓ sent"), nothing to do ("nothing to send"), or that it was not caught. Words written say nothing here
 * (the message box shows them). With details on (a per-browser setting), how each command was heard, the
 * short transcripts that were no command, and every reason something was ignored.
 */

const DONE = { send: 'sent', pause: 'paused', resume: 'resumed', clear: 'cleared', undo: 'undone' } as const
const NOTHING = { send: 'nothing to send', undo: 'nothing to undo' } as const

export function feedbackOf(heard: Heard, details: boolean): string | null {
  switch (heard.kind) {
    case 'command': {
      const said = heard.done ? `✓ ${DONE[heard.command]}` : (NOTHING[heard.command as keyof typeof NOTHING] ?? null)
      return said && details ? `${said} (${heard.how})` : said
    }
    case 'text':
      return details && heard.short ? `transcribed: ${clip(heard.text)} (not a command)` : null
    case 'ignored':
      if (heard.why === 'too short') return "didn't catch that (too short)"
      if (heard.why === 'failed') return "didn't catch that (transcription failed)"
      return details ? IGNORED[heard.why] : null
  }
}

const IGNORED = {
  'too quiet': 'ignored: too quiet',
  'no session': 'ignored: no session page open',
  paused: 'ignored: commands only',
  'nothing said': 'transcribed: nothing',
} as const

const clip = (text: string) => (text.length > 28 ? `${text.slice(0, 27)}…` : text)

const DETAILS_KEY = 'muxtower.live.details'

export function liveDetails(): boolean {
  try {
    return localStorage.getItem(DETAILS_KEY) === '1'
  } catch {
    return false
  }
}

export function setLiveDetails(on: boolean) {
  try {
    if (on) localStorage.setItem(DETAILS_KEY, '1')
    else localStorage.removeItem(DETAILS_KEY)
  } catch {
    // storage blocked: details stay off
  }
}
