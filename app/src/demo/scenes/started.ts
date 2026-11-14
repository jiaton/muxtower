import type { Session } from '@/lib/api/types'
import type { Scene } from '../world'
import { DEMO_DAEMON, HOME, NODE, demoSession } from './session'
import { talk } from './talk'
import { claudeInput, claudeWelcome, codexInput, codexWelcome } from './terminal'

/** Each machine's home and default folder, as `GET /v1/me` and `GET /v1/nodes` give them. */
const HOMES: Record<string, string> = { [DEMO_DAEMON.name]: HOME, [NODE]: '/Users/dev' }
export const DEFAULT_FOLDER: Record<string, string> = { [DEMO_DAEMON.name]: `${HOME}/code`, [NODE]: '/Users/dev/code' }

/** What a reader asks for when starting a session (`POST /v1/sessions`). */
export interface Start {
  runtime: string
  cwd?: string | null
  name?: string | null
  node?: string | null
  prompt?: string | null
}

/** A session the reader started: a fresh agent in its folder, on the machine asked for. It joins the
 *  project of a session already in that folder, and answers as every demo session does. `others` are the
 *  sessions there are; `n` makes its id unique. */
export function startedScene(start: Start, others: Session[], n: number): Scene {
  const machine = start.node || DEMO_DAEMON.name
  const home = HOMES[machine] ?? HOME
  const asked = start.cwd?.trim().replace(/\/+$/, '') || DEFAULT_FOLDER[machine] || `${home}/code`
  const cwd = asked === '~' ? home : asked.replace(/^~\//, `${home}/`)
  const codex = start.runtime === 'codex'
  const shown = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
  const near = others.find((s) => s.cwd === cwd && (s.node ?? DEMO_DAEMON.name) === machine && s.project)
  const id = start.node ? `${start.node}~new-${n}` : `new-${n}`
  const now = new Date().toISOString()
  return {
    session: demoSession({
      id,
      name: start.name?.trim() || cwd.split('/').filter(Boolean).at(-1) || 'session',
      cwd,
      runtime: codex ? 'codex' : 'claude-code',
      machine,
      node: start.node || null,
      tmux_session: `mxt-new-${n}`,
      ...(near
        ? {
            project: near.project,
            project_auto: near.project_auto,
            project_source: near.project_source,
            project_anchor: near.project_anchor,
            git: near.git,
          }
        : {}),
      created_at: now,
      updated_at: now,
    }),
    history: codex ? codexWelcome(shown) : claudeWelcome(shown),
    footer: codex ? codexInput : claudeInput,
    items: [],
    reply: talk(codex ? 'codex' : 'claude', 1),
  }
}
