import type { TerminalLine } from '@/components/shared/terminal'

export const api = {
  label: '06',
  title: 'Build your own client.',
  lead: 'Everything the app does goes through a typed HTTP and WebSocket API, described in `openapi.json`. The glasses app is built on it alone; a button, a display or a home automation can be too.',
  note: 'Ideas: the glasses app is the client muxtower ships besides its web app.',
}

export const apiIdeas = [
  {
    title: 'A key that approves',
    text: 'A Stream Deck key that lights when an agent waits, and sends the recommended option when pressed: `POST /v1/sessions/{id}/approve`.',
  },
  {
    title: 'A display of who needs you',
    text: 'An e-ink frame on the desk, fed by the stream’s `sessions` frames: state, machine and what each one asks.',
  },
  { title: 'Home Assistant', text: 'A sensor per session state, and an automation that turns a lamp amber while one waits on you.' },
  {
    title: 'Voice, anywhere',
    text: 'Record a reply, turn it into text with `POST /v1/asr`, and send it with `POST /v1/sessions/{id}/input`.',
  },
]

export const apiTranscript: TerminalLine[] = [
  { kind: 'comment', text: '# pair it like a phone: a one-time code from `muxtower pair`, claimed for a token of its own' },
  { kind: 'command', text: 'curl -X POST https://hub.example/v1/pair/claim -d \'{"code": "K7QM-3XPA", "device_name": "desk-key"}\'' },
  { kind: 'command', text: 'curl -H "Authorization: Bearer $TOKEN" https://hub.example/v1/sessions' },
  { kind: 'output', text: '[{"id": "5b9f2e81c044", "name": "shop", "machine": "server", "state": "needs_permission",' },
  { kind: 'output', text: '  "pending": {"tool_name": "Bash", "detail": "npm test -- payments", "recommended": "2", …}}, …]' },
  {
    kind: 'command',
    text: 'curl -X POST -H "Authorization: Bearer $TOKEN" https://hub.example/v1/sessions/5b9f2e81c044/approve -d \'{"option": "2"}\'',
  },
  { kind: 'comment', text: '# or live, over one WebSocket: /v1/stream' },
  { kind: 'output', text: '→ {"type": "subscribe", "topic": "sessions"}' },
  { kind: 'output', text: '← {"type": "sessions", "sessions": [ … ]}' },
]
