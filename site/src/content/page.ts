/** The page's copy outside its sections' lists: header, hero, footer. English only. */

export const nav = [
  { href: '#demo', label: 'Demo' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#get-started', label: 'Get started' },
  { href: '#features', label: 'Features' },
  { href: '#faq', label: 'FAQ' },
]

export const hero = {
  eyebrow: 'Open source · Self-hosted',
  title: 'Your coding agents, from your phone.',
  lead: 'Approve, answer and steer Claude Code and Codex in the terminals they already run in. muxtower is a small daemon next to your agents and a web app on your phone: no account, no cloud, nothing to change in how you work.',
  install: 'pipx install muxtower',
  demo: 'Try the live demo',
  source: 'View on GitHub',
}

/** Said by name, never by logo: muxtower is not affiliated with any of them. */
export const agents = [
  { name: 'Claude Code', note: 'hooks + screen' },
  { name: 'Codex', note: 'hooks + app-server' },
  { name: 'OpenCode', note: 'terminal' },
]

export const footer = {
  tagline: 'A control tower for the coding agents on your machines.',
  status: 'Status: early (0.1). Interfaces may change.',
  license: 'Apache-2.0',
}
