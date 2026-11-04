import type { Scene, Step } from '../world'
import { HOME, ago, demoSession, reply, tool } from './session'
import { talk } from './talk'
import { answered, bold, call, claudeInput, claudeWelcome, gray, green, permission, red, working } from './terminal'
import { bash, edit, grep, read, says, transcript, you } from './transcript'

const COMMAND = 'npm test -- payments'
const OPTIONS = ['Yes', "Yes, and don't ask again for npm test commands", 'No, and tell Claude what to do differently']
const DONE =
  'All 42 payment tests pass. A charge now retries up to 3 times with backoff (200, 400, 800 ms), and the idempotency key keeps a retried charge from being taken twice.'

const TASK = 'Add retries with backoff to the payment client, then run its tests.'

/** What it did before: a refund fix, committed, then the task it is on. */
const EARLIER = transcript('claude', [
  you('Refunds count tax twice when only part of an order is refunded. Find out why and fix it.', 62),
  grep('taxAmount', 4),
  read('src/payments/refunds.ts', 142),
  read('src/orders/totals.ts', 88),
  says(
    'Found it: a partial refund takes the tax of the refunded lines, then adds the order-level tax on top (refunds.ts, line 57). I will take tax only from the refunded lines and add tests for one, some and all lines refunded.',
  ),
  edit('src/payments/refunds.ts', 6, 9),
  edit('src/payments/refunds.test.ts', 31),
  bash('npm test -- refunds', 'Run the refund tests', 'PASS src/payments/refunds.test.ts', 'Tests: 18 passed, 18 total'),
  bash('git diff --stat', 'Show what changed', '2 files changed, 37 insertions(+), 9 deletions(-)'),
  says('All 18 refund tests pass, 3 of them new. Shall I commit it?'),
  you('Yes, commit it.', 41),
  bash(
    'git commit -am "Refunds: count tax once"',
    'Commit the fix',
    '[main 4f2a91c] Refunds: count tax once',
    '2 files changed, 37 insertions(+), 9 deletions(-)',
  ),
  says('Committed as 4f2a91c on main.'),
  you(TASK, 5),
  read('src/payments/client.ts', 96),
  grep('idempotencyKey', 2),
  says("I'll wrap the charge call in a retry with backoff, keyed so a retry can't charge twice."),
  edit('src/payments/client.ts', 14),
  edit('src/payments/client.test.ts', 48),
])
/** The test run it asks to make, then its answer. */
const RUN = EARLIER.next

/** The approval story: Claude Code wants to run the tests and waits for a yes. */
export function shopApi(): Scene {
  const approved = (): Step[] => [
    {
      after: 0,
      session: { state: 'busy', pending: null },
      add: call(`Bash(${COMMAND})`, green),
      footer: [...working('Running', 1), ...claudeInput],
    },
    {
      after: 900,
      add: [
        gray('  ⎿  > shop-api@1.4.0 test'),
        `     ${green(bold('PASS'))} src/payments/client.test.ts`,
        `     ${green(bold('PASS'))} src/payments/refunds.test.ts`,
        gray('     Tests: 42 passed, 42 total'),
      ],
      footer: [...working('Running', 3), ...claudeInput],
      items: [tool(RUN, { tool_name: 'Bash', text: COMMAND, description: 'Run the payment tests', status: 'done' })],
    },
    { after: 1200, footer: [...working('Thinking', 5), ...claudeInput] },
    {
      after: 1300,
      add: answered(DONE),
      footer: claudeInput,
      session: { state: 'idle', unread: true, last_message: DONE, finished_at: new Date().toISOString() },
      items: [reply(RUN + 1, { text: DONE })],
    },
  ]
  const declined = (): Step[] => [
    {
      after: 0,
      session: { state: 'idle', pending: null, last_message: 'Not run. What should I do instead?' },
      add: [...call(`Bash(${COMMAND})`, red), gray('  ⎿  Not run'), ...answered('Not run. What should I do instead?')],
      footer: claudeInput,
      items: [tool(RUN, { tool_name: 'Bash', text: COMMAND, description: 'Run the payment tests', status: 'cancelled' })],
    },
  ]
  return {
    session: demoSession({
      id: 'shop-api',
      name: 'shop-api',
      cwd: `${HOME}/code/shop-api`,
      state: 'needs_permission',
      needs_attention: true,
      pending: {
        state: 'needs_permission',
        tool_name: 'Bash',
        detail: COMMAND,
        options: OPTIONS.map((label, i) => ({ key: String(i + 1), label })),
        recommended: '2',
        questions: [],
      },
      updated_at: ago(0.3),
      team_role: 'worker',
      team_note: 'Implements what research agreed on',
      git: { repo: `${HOME}/code/shop-api`, worktree: `${HOME}/code/shop-api`, branch: 'main', remote: 'acme/shop-api' },
      project: 'acme/shop-api',
      project_auto: true,
      project_source: 'git remote',
      project_anchor: `${HOME}/code/shop-api`,
      working_dir: `${HOME}/code/shop-api/services/payments`,
    }),
    history: [...claudeWelcome(`~/code/shop-api`), ...EARLIER.history],
    footer: permission(COMMAND, 'Run the payment tests', OPTIONS),
    items: [...EARLIER.items, tool(RUN, { tool_name: 'Bash', text: COMMAND, description: 'Run the payment tests', status: 'running' })],
    tasks: [
      {
        id: 1, at: ago(5), from_id: 'release-notes', from_label: 'Release notes for 2.4 (research) · release-notes',
        to_id: 'shop-api', text: TASK, status: 'delivered',
        delivered_at: ago(5),
      },
    ], // prettier-ignore
    approve: (option) => (option === '3' ? declined() : approved()),
    deny: declined,
    reply: talk('claude', RUN + 10),
  }
}
