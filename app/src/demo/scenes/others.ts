import type { Scene } from '../world'
import { HOME, NODE, ago, demoSession, prompt, reply } from './session'
import { talk } from './talk'
import { answered, claudeInput, claudeWelcome, said } from './terminal'
import { bash, edit, read, says, transcript, you } from './transcript'

const PLAN = 'Plan is clean: 3 to add, 0 to change, 0 to destroy. The new replica starts empty and catches up from the primary. Apply it?'

/** A provider upgrade, committed, then the plan it finished with. */
const INFRA = transcript('claude', [
  you('Upgrade the Terraform AWS provider to 5.x and fix whatever breaks.', 66),
  read('versions.tf', 18),
  edit('versions.tf', 1, 1),
  bash(
    'terraform init -upgrade',
    'Upgrade the providers',
    '- Installing hashicorp/aws v5.62.0...',
    'Terraform has been successfully initialized!',
  ),
  bash('terraform validate', 'Check the configuration', 'Error: Unsupported block type', '  on modules/network/main.tf line 41'),
  read('modules/network/main.tf', 77),
  edit('modules/network/main.tf', 14, 9),
  bash('terraform validate', 'Check the configuration', 'Success! The configuration is valid.'),
  says(
    'Upgraded to provider 5.62. The one break: inline ingress blocks in modules/network are gone in 5.x, so each rule is now its own aws_vpc_security_group_ingress_rule. The configuration validates.',
  ),
  you('Commit it.', 31),
  bash(
    'git commit -am "AWS provider 5.x"',
    'Commit the upgrade',
    '[main 9c1d0e7] AWS provider 5.x',
    '3 files changed, 16 insertions(+), 11 deletions(-)',
  ),
  says('Committed as 9c1d0e7 on main.'),
  you('Plan moving the staging database to the new region.', 9),
  read('envs/staging/db.tf', 64),
  edit('envs/staging/db.tf', 11, 2),
  bash('terraform plan -out staging.plan', 'Plan the move', 'Plan: 3 to add, 0 to change, 0 to destroy.'),
  says(PLAN),
])

/** A session on the second computer, joined to this daemon: finished while nobody looked. */
export function infra(): Scene {
  return {
    session: demoSession({
      id: `${NODE}~infra`,
      name: 'infra',
      cwd: '/Users/dev/code/infra',
      node: NODE,
      machine: NODE,
      on_host: false,
      unread: true,
      last_message: PLAN,
      finished_at: ago(6),
      created_at: ago(70),
      updated_at: ago(6),
    }),
    history: [...claudeWelcome('~/code/infra'), ...INFRA.history],
    footer: claudeInput,
    items: INFRA.items,
    reply: talk('claude', INFRA.next + 10),
  }
}

const NOTES = `## 2.4

**New**
- Usage chart on the billing page
- Payment retries with backoff

**Fixed**
- Refunds no longer count tax twice

Tag it when you're ready:

\`\`\`sh
git tag v2.4.0 && git push origin v2.4.0
\`\`\``

/** Its conversation before the notes: what is in 2.4, a check, then the draft (no screen to draw). */
const NOTES_EARLIER = transcript('claude', [
  you('Which pull requests are merged for 2.4, and which are still open?', 74),
  bash('gh pr list --state merged --search "milestone:2.4"', 'List the merged pull requests', '4 pull requests'),
  bash('gh pr list --state open --search "milestone:2.4"', 'List the open pull requests', '1 pull request'),
  says(
    'Merged: PR 212, the usage chart on the billing page; PR 215, refunds count tax once; PRs 218 and 219, dependency updates. Open: PR 221, payment retries with backoff, which shop-api is finishing.',
  ),
  you('Does the refund fix have a test?', 52),
  bash('gh pr diff 215 --name-only', 'List the files PR 215 changed', 'src/payments/refunds.ts', 'src/payments/refunds.test.ts'),
  read('src/payments/refunds.test.ts', 164),
  says('It does: three new tests cover one, some and all lines of an order refunded, each checking the tax returned.'),
  you('Draft the release notes for 2.4 from the merged pull requests.', 33),
  bash('gh pr list --state merged --search "milestone:2.4"', 'List the merged pull requests', '4 pull requests'),
])

/** A Claude Code session started outside tmux (the desktop app, Remote Control): no terminal, only its
 *  conversation. */
export function releaseNotes(): Scene {
  return {
    session: demoSession({
      id: 'release-notes',
      name: 'Release notes for 2.4',
      cwd: '/home/dev/code/shop-api',
      source: 'remote_control',
      tmux_socket: null,
      tmux_session: null,
      tmux_pane: null,
      remote_id: 'cse_demo',
      capabilities: {
        screen: false,
        conversation: true,
        keys: [],
        resize: false,
        terminate: false,
        rename: true,
        archive: true,
        archive_ends: false, // in the desktop app: archiving only hides it here
        place: false,
        images: false,
      },
      origin: 'claude_desktop',
      state_source: 'remote',
      last_message: 'Release notes for 2.4 are ready.',
      team_role: 'research',
      git: { repo: '/home/dev/code/shop-api', worktree: '/home/dev/code/shop-api', branch: 'main', remote: 'acme/shop-api' },
      project: 'acme/shop-api',
      project_auto: true,
      project_source: 'git remote',
      project_anchor: `${HOME}/code/shop-api`,
      created_at: ago(180),
      updated_at: ago(30),
    }),
    history: [],
    footer: [],
    items: [...NOTES_EARLIER.items, reply(NOTES_EARLIER.next, { text: NOTES, at: ago(30) })],
    reply: talk(null, NOTES_EARLIER.next + 10),
  }
}

const SHORTER = 'Shorter, for the changelog: "2.4 adds a usage chart and payment retries, and fixes double-counted tax on refunds."'

/** A fork of the release notes (its conversation copied into a session of its own), listed under them. */
export function releaseNotesFork(): Scene {
  const scene = releaseNotes()
  return {
    ...scene,
    session: {
      ...scene.session,
      id: 'release-notes-fork',
      name: 'Release notes for 2.4 (fork)',
      remote_id: 'cse_demo_fork',
      fork_of: 'release-notes',
      unread: true,
      last_message: SHORTER,
      created_at: ago(25),
      updated_at: ago(12),
    },
    items: [
      ...scene.items,
      prompt(NOTES_EARLIER.next + 1, { text: 'Now a one-line version for the changelog.', at: ago(14) }),
      reply(NOTES_EARLIER.next + 2, { text: SHORTER, at: ago(12) }),
    ],
  }
}

/** A session in the folder that holds the repositories: a plain folder, which nests them. */
export function tidyUp(): Scene {
  return {
    session: demoSession({ id: 'tidy-up', name: 'tidy up', cwd: `${HOME}/code`, created_at: ago(300), updated_at: ago(40) }),
    history: [...claudeWelcome('~/code'), ...said('Which repositories here have no README?'), ...answered('Only web-app.')],
    footer: claudeInput,
    items: [prompt(1, { text: 'Which repositories here have no README?', at: ago(41) }), reply(2, { text: 'Only web-app.' })],
  }
}
