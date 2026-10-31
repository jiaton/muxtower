import type { Scene, Step } from '../world'
import { HOME, ago, demoSession, prompt, reply, tool } from './session'
import { talk } from './talk'
import { answered, bold, call, claudeInput, claudeWelcome, gray, green, permission, ran, red, said, working } from './terminal'

const COMMAND = 'npm test -- payments'
const OPTIONS = ['Yes', "Yes, and don't ask again for npm test commands", 'No, and tell Claude what to do differently']
const DONE =
  'All 42 payment tests pass. A charge now retries up to 3 times with backoff (200, 400, 800 ms), and the idempotency key keeps a retried charge from being taken twice.'

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
      items: [tool(4, { tool_name: 'Bash', text: COMMAND, description: 'Run the payment tests', status: 'done' })],
    },
    { after: 1200, footer: [...working('Thinking', 5), ...claudeInput] },
    {
      after: 1300,
      add: answered(DONE),
      footer: claudeInput,
      session: { state: 'idle', unread: true, last_message: DONE, finished_at: new Date().toISOString() },
      items: [reply(5, { text: DONE })],
    },
  ]
  const declined = (): Step[] => [
    {
      after: 0,
      session: { state: 'idle', pending: null, last_message: 'Not run. What should I do instead?' },
      add: [...call(`Bash(${COMMAND})`, red), gray('  ⎿  Not run'), ...answered('Not run. What should I do instead?')],
      footer: claudeInput,
      items: [tool(4, { tool_name: 'Bash', text: COMMAND, description: 'Run the payment tests', status: 'cancelled' })],
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
    }),
    history: [
      ...claudeWelcome(`~/code/shop-api`),
      ...said('Add retries with backoff to the payment client, then run its tests.'),
      ...answered("I'll wrap the charge call in a retry with backoff, keyed so a retry can't charge twice."),
      ...ran('Update(src/payments/client.ts)', 'Added 14 lines to src/payments/client.ts'),
    ],
    footer: permission(COMMAND, 'Run the payment tests', OPTIONS),
    items: [
      prompt(1, { text: 'Add retries with backoff to the payment client, then run its tests.', at: ago(4) }),
      reply(2, { text: "I'll wrap the charge call in a retry with backoff, keyed so a retry can't charge twice." }),
      tool(3, { tool_name: 'Edit', text: 'src/payments/client.ts', status: 'done' }),
      tool(4, { tool_name: 'Bash', text: COMMAND, description: 'Run the payment tests', status: 'running' }),
    ],
    approve: (option) => (option === '3' ? declined() : approved()),
    deny: declined,
    reply: talk('claude', 10),
  }
}
