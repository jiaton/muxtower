import type { Scene } from '../world'
import { NODE, ago, demoSession, prompt, reply, tool } from './session'
import { talk } from './talk'
import { answered, claudeInput, claudeWelcome, ran, said } from './terminal'

const PLAN = 'Plan is clean: 3 to add, 0 to change, 0 to destroy. The new replica starts empty and catches up from the primary. Apply it?'

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
    history: [
      ...claudeWelcome('~/code/infra'),
      ...said('Plan moving the staging database to the new region.'),
      ...ran('Bash(terraform plan -out staging.plan)', 'Plan: 3 to add, 0 to change, 0 to destroy.'),
      ...answered(PLAN),
    ],
    footer: claudeInput,
    items: [
      prompt(1, { text: 'Plan moving the staging database to the new region.', at: ago(9) }),
      tool(2, { tool_name: 'Bash', text: 'terraform plan -out staging.plan', status: 'done' }),
      reply(3, { text: PLAN }),
    ],
    reply: talk('claude', 10),
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
        place: false,
        images: false,
      },
      state_source: 'remote',
      last_message: 'Release notes for 2.4 are ready.',
      team_role: 'research',
      project: 'acme/shop',
      created_at: ago(180),
      updated_at: ago(30),
    }),
    history: [],
    footer: [],
    items: [
      prompt(1, { text: 'Draft the release notes for 2.4 from the merged pull requests.', at: ago(33) }),
      tool(2, { tool_name: 'Bash', text: 'gh pr list --state merged --search "milestone:2.4"', status: 'done' }),
      reply(3, { text: NOTES, at: ago(30) }),
    ],
    reply: talk(null, 10),
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
      prompt(4, { text: 'Now a one-line version for the changelog.', at: ago(14) }),
      reply(5, { text: SHORTER, at: ago(12) }),
    ],
  }
}
