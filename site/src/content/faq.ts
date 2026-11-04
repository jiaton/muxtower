/** Frequently asked questions. Plain text; `code` in backticks. */
export const faqTitle = 'Questions'

export const questions = [
  {
    q: 'Do I have to change how I run my agents?',
    a: 'No. Agents in tmux are picked up as they are, approvals included, and Claude desktop and Codex app sessions are listed too. `muxtower run` is optional: it starts an agent in a tmux session of its own with its hooks pointed at the daemon.',
  },
  {
    q: 'Does my code leave my machines?',
    a: 'No. Each daemon runs on its own machine and answers only devices you paired. Agents keep talking to their own APIs. Notifications travel encrypted through your browser’s push service.',
  },
  {
    q: 'Why not just SSH in from my phone?',
    a: 'A terminal over SSH shows one machine at a time and cannot tell you which agent is waiting. muxtower knows each agent’s state across every machine, notifies you, and needs nothing but HTTPS to the hub.',
  },
  {
    q: 'What happens when a machine sleeps or goes offline?',
    a: 'Its sessions stay listed, marked offline, and come back when it does. The agents keep running in tmux whatever the phone or the hub does.',
  },
  {
    q: 'What if the hub goes down?',
    a: 'The app talks to each machine at its own HTTPS address until the hub answers again. Give a machine one with `muxtower expose tailscale`, or a Cloudflare Tunnel and `public_url` in its config.',
  },
  {
    q: 'Which agents does it support?',
    a: 'Claude Code and Codex fully: state from their hooks, approvals and questions from your phone. Any other terminal agent can be watched and typed into, and taught its dialogs with screen rules.',
  },
  {
    q: 'Is the hosted app safe to pair with my daemons?',
    a: 'It keeps your pairings only in your browser, and talks to your daemons directly. But the host’s code runs with your tokens, so the app your daemon serves itself, or a copy you host, is the most conservative choice. On a daemon, `cors.allowed_origins` limits which app origins it accepts.',
  },
  {
    q: 'Is there an app to install from a store?',
    a: 'No store. The daemon serves a web app that installs on your home screen and receives notifications on Android, iOS and desktop.',
  },
  {
    q: 'Is it free?',
    a: 'Yes, open source under Apache 2.0. You bring your own agents and their accounts.',
  },
]
