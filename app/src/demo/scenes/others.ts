import type { Scene } from '../world'
import { HOME, NODE, ago, demoSession, nextStep, prompt, reply } from './session'
import { heldTalk, talk } from './talk'
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
      team_role: 'ops',
      project: 'acme/infra',
      permission_mode: 'bypassPermissions',
      project_auto: true,
      project_source: 'git remote',
      project_anchor: '/Users/dev/code/infra',
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
        resume: false,
        continue_terminal: false,
      },
      origin: 'claude_desktop',
      machine: 'mac',
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
    items: [...NOTES_EARLIER.items, reply(NOTES_EARLIER.next, { text: NOTES, at: ago(30) }), NOTES_WAITING],
    // Sent from here, a message waits in the desktop app for Deliver (clicked there a moment later).
    reply: heldTalk(NOTES_EARLIER.next + 10, () => [NOTES_WAITING]),
  }
}

/** A message sent from here that the desktop app holds until Deliver is clicked there. */
const NOTES_WAITING = prompt(NOTES_EARLIER.next + 5, { text: 'Add a line about the new export button.', at: ago(3), status: 'pending' })

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
      ...scene.items.filter((item) => item !== NOTES_WAITING), // a fork copies what was taken in
      prompt(NOTES_EARLIER.next + 1, { text: 'Now a one-line version for the changelog.', at: ago(14) }),
      reply(NOTES_EARLIER.next + 2, { text: SHORTER, at: ago(12) }),
    ],
    reply: heldTalk(NOTES_EARLIER.next + 10, () => []),
  }
}

const SHORTEST = 'Even shorter: "2.4: usage chart, payment retries, refund tax fix."'
const POST = 'A draft post for 2.4: "Charts and steadier payments", one paragraph per change, the tax fix last.'

/** A fork of the fork: three levels, so the list draws its tree's joined rails. */
export function changelogFork(): Scene {
  const scene = releaseNotesFork()
  return {
    ...scene,
    session: {
      ...scene.session,
      id: 'changelog-fork',
      name: 'Changelog line, shorter',
      remote_id: 'cse_demo_fork_2',
      fork_of: 'release-notes-fork',
      unread: false,
      last_message: SHORTEST,
      created_at: ago(11),
      updated_at: ago(9),
    },
    items: [
      ...scene.items,
      prompt(NOTES_EARLIER.next + 3, { text: 'Shorter still, under 60 characters.', at: ago(10) }),
      reply(NOTES_EARLIER.next + 4, { text: SHORTEST, at: ago(9) }),
    ],
  }
}

/** A second fork of the release notes, the last one under them. */
export function releasePostFork(): Scene {
  const scene = releaseNotes()
  return {
    ...scene,
    session: {
      ...scene.session,
      id: 'release-post-fork',
      name: 'Release post draft',
      remote_id: 'cse_demo_fork_3',
      fork_of: 'release-notes',
      last_message: POST,
      created_at: ago(22),
      updated_at: ago(18),
    },
    items: [
      ...scene.items.filter((item) => item !== NOTES_WAITING),
      prompt(NOTES_EARLIER.next + 1, { text: 'Turn these into a short blog post.', at: ago(20) }),
      reply(NOTES_EARLIER.next + 2, { text: POST, at: ago(18) }),
      // Claude desktop's next-step box: replies to pick.
      nextStep(NOTES_EARLIER.next + 3, {
        text: 'The draft is in posts/2-4.md.',
        ask: 'Publish it?',
        status: 'pending',
        at: ago(18),
        actions: [
          { label: 'Post it', message: 'Post it to the blog.' },
          { label: 'Shorter first', message: 'Make it shorter first.' },
        ],
      }),
    ],
    reply: heldTalk(NOTES_EARLIER.next + 10, () => []),
  }
}

/** A session in the folder that holds the repositories: a plain folder, which nests them. */
export function tidyUp(): Scene {
  return {
    session: demoSession({ id: 'tidy-up', name: 'tidy up', cwd: `${HOME}/code`, created_at: ago(300), updated_at: ago(40) }),
    history: [...claudeWelcome('~/code'), ...said('Which repositories here have no README?'), ...answered('Only web-app.')],
    footer: claudeInput,
    items: [prompt(1, { text: 'Which repositories here have no README?', at: ago(41) }), reply(2, { text: 'Only web-app.' })],
    reply: talk('claude', 10),
  }
}

const SUGGESTED = 'add a test for the label'
const LABEL_TEST =
  'This is the demo, so nothing ran. On your own machine I would add a test that the button reads "Pay $42.00" for a $42 cart, and that it changes when the cart does.'

/** The same project on the other computer: a checkout of shop-api on the laptop, so grouping by project
 *  shows one project across devices (each row saying where it runs). */
export function shopApiLaptop(): Scene {
  return {
    session: demoSession({
      id: `${NODE}~shop-api-ui`,
      name: 'checkout page',
      cwd: '/Users/dev/code/shop-api',
      git: { repo: '/Users/dev/code/shop-api', worktree: '/Users/dev/code/shop-api', branch: 'checkout-ui', remote: 'acme/shop-api' },
      team_role: 'worker — the checkout page',
      project: 'acme/shop-api',
      project_auto: true,
      project_source: 'git remote',
      project_anchor: '/Users/dev/code/shop-api',
      node: NODE,
      machine: NODE,
      on_host: false,
      created_at: ago(90),
      updated_at: ago(15),
      suggestion: SUGGESTED, // Claude Code's suggested next prompt: Send (or ⌘↵) takes it
    }),
    history: [
      ...claudeWelcome('~/code/shop-api'),
      ...said('Make the checkout button say what it charges.'),
      ...answered('It now reads "Pay $42.00".'),
    ],
    footer: claudeInput,
    items: [
      prompt(1, { text: 'Make the checkout button say what it charges.', at: ago(16) }),
      reply(2, { text: 'It now reads "Pay $42.00".', at: ago(15) }),
    ],
    reply: talk('claude', 10, { [SUGGESTED]: LABEL_TEST }),
  }
}
