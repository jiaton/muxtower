/** Frequently asked questions. Answers are plain text; `code` spans are written in backticks. */

export const faq = {
  eyebrow: 'FAQ',
  title: 'Questions',
}

export const questions = [
  {
    q: 'Do I have to change how I run Claude Code?',
    a: 'No. Agents running in tmux are picked up as they are, approvals included. `muxtower run claude` is optional: it starts one in a tmux session of its own, with its hooks pointing at the daemon, and writes nothing to your own settings.',
  },
  {
    q: 'Does my code leave my machine?',
    a: 'No. The daemon runs on your machine and answers only the devices you pair; notifications travel encrypted through your browser’s push service. Agents keep talking to their own APIs as they always do. This site is static and never sees a token or a terminal.',
  },
  {
    q: 'Can I reach it from outside my network?',
    a: 'Yes, two ways. `muxtower expose tailscale` puts it on your tailnet in one command. Or put it on your own domain behind any reverse proxy or tunnel, optionally with your own sign-in in front.',
  },
  {
    q: 'Is it safe on the public internet?',
    a: 'It is built for it: a token per device, single-use pairing codes, rate limits, an audit log, and 401/403 only for a wrong credential so fail2ban can ban guessers. A sign-in gate in front adds a second lock.',
  },
  {
    q: 'Which agents does it support?',
    a: 'Claude Code and Codex fully: state from their hooks, approvals and questions from your phone. Any other terminal agent, OpenCode for example, can be watched and typed into, and screen rules in plain TOML teach muxtower its dialogs.',
  },
  {
    q: 'Is there an app to install from a store?',
    a: 'No store needed. The daemon serves a web app that installs on your home screen and receives notifications, on Android, iOS and desktop.',
  },
  {
    q: 'Does it work with several computers?',
    a: 'Yes. Run the daemon on each and join them to the one that is always on. Your phone needs only that address; a sleeping laptop’s sessions stay listed, marked offline.',
  },
  {
    q: 'Can my agents work together?',
    a: 'Yes. Every session muxtower starts can reach it as itself through MCP: `my_team` says who it is and who else works on its project, and `send_task` hands a teammate work. A task waits while its receiver is busy with you, and roles are plain text you choose.',
  },
  {
    q: 'Is it free?',
    a: 'Yes. muxtower is open source under the Apache 2.0 license. You need your own agents and their accounts.',
  },
]
