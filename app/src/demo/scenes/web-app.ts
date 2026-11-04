import type { Scene, Step } from '../world'
import { HOME, ago, demoSession, reply, tool } from './session'
import { talk } from './talk'
import { answered, claudeInput, claudeWelcome, question, ran, working } from './terminal'
import { bash, edit, grep, read, says, transcript, you } from './transcript'

const ASK = 'Which chart library should I use for the usage chart? The app has none yet.'
const CHOICES: [string, string][] = [
  ['Recharts', 'React components, quickest to build with'],
  ['Chart.js', 'Canvas, the smallest bundle'],
  ['visx', 'Low-level D3 pieces, the most control'],
]

/** What it did before: a price fix, checked, then the chart it is about to start. */
const EARLIER = transcript('claude', [
  you('The billing page shows EU customers the plan price without VAT. Fix it.', 36),
  grep('formatPrice', 6),
  read('src/billing/page.tsx', 121),
  read('src/billing/price.ts', 40),
  says(
    'formatPrice is given the net amount and never sees the tax rate. I will pass the customer\'s rate through and show the gross price, marked "incl. VAT", where a rate applies.',
  ),
  edit('src/billing/price.ts', 8, 3),
  edit('src/billing/page.tsx', 2, 1),
  edit('src/billing/price.test.ts', 22),
  bash('npm test -- billing', 'Run the billing tests', 'Test Files  3 passed (3)', 'Tests  27 passed (27)'),
  says('EU customers now see the gross price with "incl. VAT". All 27 billing tests pass, 4 of them new.'),
  you('Run the type check and lint too.', 24),
  bash(
    'npm run typecheck && npm run lint',
    'Check types and lint',
    '> web-app@0.9.2 typecheck',
    '> web-app@0.9.2 lint',
    'No problems found',
  ),
  says('Both are clean.'),
  you('Add a usage chart to the billing page.', 2),
  read('src/billing/api.ts', 52),
  read('package.json', 64),
  says('The usage endpoint already returns daily totals, but the app has no chart library yet. Before I start, one choice to make.'),
])
/** Its answer to the pick, then the chart's files. */
const NEXT = EARLIER.next

/** The question story: Claude Code asks which library to use and waits for a pick. */
export function webApp(): Scene {
  const picked = (option: string): Step[] => {
    const [label] = CHOICES[Number(option) - 1] ?? CHOICES[0]
    const done = `The billing page now shows daily usage for the last 30 days, drawn with ${label}, with a tooltip per day and the plan's limit as a line.`
    return [
      {
        after: 0,
        session: { state: 'busy', pending: null },
        add: answered(`${label} it is.`),
        footer: [...working('Writing', 1), ...claudeInput],
        items: [reply(NEXT, { text: `${label} it is.` })],
      },
      {
        after: 1300,
        add: ran('Write(src/billing/usage-chart.tsx)', 'Wrote 64 lines to src/billing/usage-chart.tsx'),
        footer: [...working('Writing', 3), ...claudeInput],
        items: [tool(NEXT + 1, { tool_name: 'Write', text: 'src/billing/usage-chart.tsx', status: 'done' })],
      },
      {
        after: 1100,
        add: ran('Update(src/billing/page.tsx)', 'Updated src/billing/page.tsx with 3 additions'),
        items: [tool(NEXT + 2, { tool_name: 'Edit', text: 'src/billing/page.tsx', status: 'done' })],
      },
      {
        after: 1200,
        add: answered(done),
        footer: claudeInput,
        session: { state: 'idle', unread: true, last_message: done, finished_at: new Date().toISOString() },
        items: [reply(NEXT + 3, { text: done })],
      },
    ]
  }
  return {
    session: demoSession({
      id: 'web-app',
      name: 'web-app',
      cwd: `${HOME}/code/web-app`,
      state: 'needs_answer',
      needs_attention: true,
      pending: {
        state: 'needs_answer',
        tool_name: null,
        detail: ASK,
        options: CHOICES.map(([label], i) => ({ key: String(i + 1), label })),
        recommended: null,
        questions: [],
      },
      created_at: ago(40),
      updated_at: ago(1.5),
    }),
    history: [...claudeWelcome('~/code/web-app'), ...EARLIER.history],
    footer: question('Chart library', ASK, CHOICES),
    items: EARLIER.items,
    approve: picked,
    reply: talk('claude', NEXT + 10),
  }
}
