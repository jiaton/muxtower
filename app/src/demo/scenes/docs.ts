import type { Scene, Step } from '../world'
import { HOME, ago, demoSession } from './session'
import { talk } from './talk'
import { codexAnswered, codexDid, codexInput, codexSaid, codexWelcome, codexWorking } from './terminal'

/** What it did before this turn, as Codex drew it. */
const EARLIER = [
  ...codexSaid('Read the CLI and the docs, and list what the docs are missing.'),
  ...codexDid('Explored', 'Read README.md, docs/api.md, docs/configuration.md', 'List src/cli'),
  ...codexDid('Ran ls docs', 'api.md  configuration.md  deploy.md'),
  ...codexAnswered(
    'The docs cover the API, configuration and deploying, but nothing takes a new user from installing to a first run. Also, three links in docs/configuration.md point at files that moved.',
  ),
  ...codexSaid('Fix those links first.'),
  ...codexDid('Ran grep -n "](" docs/configuration.md', '12:  [deploy](../deploy.md)', '…  +13 lines'),
  ...codexDid('Edited docs/configuration.md (+3 -3)'),
  ...codexDid('Ran npx markdown-link-check docs/*.md', '41 links checked, 0 broken'),
  ...codexAnswered('Fixed: the three links now point at docs/deploy.md and docs/api.md. All 41 links in docs/ resolve.'),
  ...codexSaid('Write the getting started guide for the CLI.'),
  ...codexDid('Explored', 'Read docs/api.md', 'Search "def main" in src/cli'),
]

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
      project: 'acme/shop-api',
      project_auto: true,
      project_source: 'git remote',
      project_anchor: `${HOME}/code/shop-api`,
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
    history: [...codexWelcome('~/code/shop-api-docs'), ...EARLIER],
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
