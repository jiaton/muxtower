import type { Scene, Step } from '../world'
import { HOME, ago, demoSession } from './session'
import { talk } from './talk'
import { codexAnswered, codexDid, codexInput, codexSaid, codexWelcome, codexWorking } from './terminal'

const DONE = 'Wrote docs/getting-started.md: install, first run, and the three commands most people need, each with its output.'

/** Codex at work in a tmux pane muxtower found on its own: the reader watches it get there. */
export function docs(): Scene {
  const tick = (seconds: number, after: number): Step => ({ after, footer: [...codexWorking(seconds), ...codexInput] })
  return {
    session: demoSession({
      id: 'docs',
      name: 'docs',
      cwd: `${HOME}/code/shop-api-docs`,
      git: { repo: `${HOME}/code/shop-api`, worktree: `${HOME}/code/shop-api-docs`, branch: 'docs', remote: 'acme/shop-api' },
      runtime: 'codex',
      source: 'adopted',
      tmux_socket: 'default',
      tmux_session: 'docs',
      capabilities: {
        screen: true,
        conversation: false,
        keys: [],
        resize: true,
        terminate: false,
        rename: true,
        archive: false,
        place: false,
        images: false,
      },
      state: 'busy',
      state_source: 'screen',
      matched_rule: 'working',
      created_at: ago(25),
      updated_at: ago(0.1),
    }),
    history: [...codexWelcome('~/code/shop-api-docs'), ...codexSaid('Write the getting started guide for the CLI.')],
    footer: [...codexWorking(4), ...codexInput],
    items: [],
    start: [
      tick(5, 1000),
      { after: 1500, add: codexDid('Explored', 'Read README.md', 'Read src/cli/main.py, src/cli/pair.py') },
      tick(8, 1500),
      tick(10, 2000),
      { after: 1800, add: codexDid('Ran muxtower --help', 'muxtower  status: daemon, sessions', '…  +6 lines') },
      tick(13, 1500),
      tick(15, 2000),
      { after: 2000, add: codexDid('Added docs/getting-started.md (+118 -0)') },
      tick(18, 1500),
      {
        after: 2000,
        add: codexAnswered(DONE),
        footer: codexInput,
        session: { state: 'idle', state_source: 'screen', matched_rule: null, unread: true, last_message: DONE },
      },
    ],
    reply: talk('codex', 10),
  }
}
