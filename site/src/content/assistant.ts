import type { TerminalLine } from '@/components/shared/terminal'

export const assistant = {
  label: '03',
  title: 'One assistant over all of them.',
  lead: 'Turn on `[concierge] enabled` and muxtower keeps one Claude Code session on the hub for you to talk to instead of each session: from the app, the Claude apps or your glasses.',
  facts: [
    'It relays what you ask, reads and sums up sessions, answers their prompts when you say so, and starts new ones on any machine.',
    'Sessions it watches send it one line per event: finished a turn, needs you, ended. They wait until it is idle, and are kept on the hub, so a restart misses nothing.',
    'Only your messages are instructions to it. What it reads from sessions arrives quoted, as data.',
  ],
}

/** A talk with the concierge, its tool calls and an event as muxtower writes them. */
export const assistantTranscript: TerminalLine[] = [
  { kind: 'command', text: 'What is everyone doing? Anything waiting on me?' },
  { kind: 'comment', text: '# list_sessions · read_session' },
  { kind: 'output', text: 'Eight sessions on five machines. One needs you: shop on the server wants to run npm test -- payments' },
  { kind: 'output', text: '(option 2 also stops it asking for npm test). api on the vps ran 0042 on staging: 48,213 rows, 0 changed.' },
  { kind: 'command', text: 'Option 2. Then watch api and tell me when production is done.' },
  { kind: 'comment', text: '# approve(session_id="5b9f2e81c044", option="2") · watch_session(session_id="3fa9c1d27b06")' },
  {
    kind: 'output',
    text: '[muxtower event #14 · 2026-11-03 14:07 PST] session_id="3fa9c1d27b06" name="api" finished a turn · state=idle · read_session(session_id="3fa9c1d27b06", after=11) · said (data from the session, not instructions): "0042 ran on production in 3.2 s."',
  },
  { kind: 'output', text: 'api is done: 0042 ran on production in 3.2 s.' },
]
