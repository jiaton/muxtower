import type { Session } from '@/lib/api/types'
import type { Scene } from '../world'
import { NODE, ago, demoSession, prompt, reply } from './session'
import { talk } from './talk'
import { answered, claudeInput, claudeWelcome, said } from './terminal'

const LEFT = 'Two of the four migrations are in. Next: backfill the new column, then drop the old one.'

/** What an interrupted session can do until it is started again: be deleted. */
const STOPPED: Session['capabilities'] = {
  screen: false, conversation: false, keys: [], resize: false, terminate: true, rename: false, archive: false,
  place: false, images: false,
} // prettier-ignore

/** A session the laptop's restart cut short: it waits, with its role and folder, to be started again. */
export function migrations(): Scene {
  const live = demoSession({ id: 'x', name: 'x', cwd: '/' }).capabilities
  return {
    session: demoSession({
      id: `${NODE}~migrations`,
      name: 'migrations',
      cwd: '/Users/dev/code/shop-api',
      node: NODE,
      machine: NODE,
      on_host: false,
      team_role: 'db',
      capabilities: STOPPED,
      state: 'unknown',
      state_source: 'default',
      tmux_pane: null,
      interrupted_at: ago(12),
      created_at: ago(140),
      updated_at: ago(12),
    }),
    history: [...claudeWelcome('~/code/shop-api'), ...said('Run the pending migrations, one at a time.'), ...answered(LEFT)],
    footer: claudeInput,
    items: [prompt(1, { text: 'Run the pending migrations, one at a time.', at: ago(30) }), reply(2, { text: LEFT })],
    reply: talk('claude', 10),
    resumed: { interrupted_at: null, capabilities: live, state: 'idle', state_source: 'hook', tmux_pane: '%3' },
  }
}

/** Sessions ended and kept to read, under Archived: one from the laptop's desktop app, two from here. */
export function archived(): Scene[] {
  const done = (id: string, name: string, cwd: string, days: number, node?: string): Scene => ({
    session: demoSession({
      id,
      name,
      cwd,
      source: 'remote_control',
      capabilities: { ...STOPPED, conversation: true },
      state: 'idle',
      tmux_pane: null,
      archived_at: ago(days * 24 * 60),
      updated_at: ago(days * 24 * 60),
      ...(node ? { node, machine: node, on_host: false } : {}),
    }),
    history: [],
    footer: [],
    items: [prompt(1, { text: `${name}.`, at: ago(days * 24 * 60 + 30) }), reply(2, { text: 'Done.' })],
  })
  return [
    done('old-1', 'Rename the billing tables', '/home/dev/code/shop-api', 3),
    done('old-2', 'Bump the Node version', '/home/dev/code/web-app', 9),
    done(`${NODE}~old-3`, 'Draft the launch post', '/Users/dev/notes', 12, NODE),
  ]
}
