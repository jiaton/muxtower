/** How it works: the path from an agent to your phone, left to right. */

export const how = {
  eyebrow: 'How it works',
  title: 'It sits where your agents already are.',
  lead: 'Not another place to run agents. Keep running Claude Code and Codex the way you do; muxtower watches them, knows which one is waiting on you and for what, and hands you the controls.',
  hub: 'More than one computer? Each runs a daemon and joins the one that is always on. Your phone talks only to that hub; a laptop dials out to it, so it needs no address of its own.',
}

export const stages = [
  {
    id: 'agents',
    title: 'Your agents',
    items: ['Claude Code and Codex in tmux', 'Sessions you already started', 'Claude desktop and Remote Control', 'Codex app threads'],
  },
  {
    id: 'daemon',
    title: 'muxtower daemon',
    items: [
      'On your machine, 127.0.0.1',
      'Agent hooks: the exact request',
      'Screen rules for everything else',
      'Typed HTTP and WebSocket API',
    ],
  },
  {
    id: 'https',
    title: 'HTTPS',
    items: ['Tailscale, one command', 'or your own domain', 'behind your own sign-in', 'per-device tokens either way'],
  },
  {
    id: 'you',
    title: 'You',
    items: ['Phone (installable web app)', 'Any browser', 'Push notifications', 'Even Realities G2 glasses'],
  },
]
