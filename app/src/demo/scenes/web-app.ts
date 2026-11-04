import type { Scene, Step } from '../world'
import { HOME, ago, demoSession, prompt, reply, tool } from './session'
import { talk } from './talk'
import { answered, claudeInput, claudeWelcome, question, ran, said, working } from './terminal'

const ASK = 'Which chart library should I use for the usage chart? The app has none yet.'
const CHOICES: [string, string][] = [
  ['Recharts', 'React components, quickest to build with'],
  ['Chart.js', 'Canvas, the smallest bundle'],
  ['visx', 'Low-level D3 pieces, the most control'],
]

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
        items: [reply(3, { text: `${label} it is.` })],
      },
      {
        after: 1300,
        add: ran('Write(src/billing/usage-chart.tsx)', 'Wrote 64 lines to src/billing/usage-chart.tsx'),
        footer: [...working('Writing', 3), ...claudeInput],
        items: [tool(4, { tool_name: 'Write', text: 'src/billing/usage-chart.tsx', status: 'done' })],
      },
      {
        after: 1100,
        add: ran('Update(src/billing/page.tsx)', 'Updated src/billing/page.tsx with 3 additions'),
        items: [tool(5, { tool_name: 'Edit', text: 'src/billing/page.tsx', status: 'done' })],
      },
      {
        after: 1200,
        add: answered(done),
        footer: claudeInput,
        session: { state: 'idle', unread: true, last_message: done, finished_at: new Date().toISOString() },
        items: [reply(6, { text: done })],
      },
    ]
  }
  return {
    session: demoSession({
      id: 'web-app',
      name: 'web-app',
      agent_name: 'Usage chart on the billing page',
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
    history: [
      ...claudeWelcome('~/code/web-app'),
      ...said('Add a usage chart to the billing page.'),
      ...answered('Before I start, one choice to make.'),
    ],
    footer: question('Chart library', ASK, CHOICES),
    items: [
      prompt(1, { text: 'Add a usage chart to the billing page.', at: ago(2) }),
      reply(2, { text: `Before I start, one choice to make: ${ASK}` }),
    ],
    approve: picked,
    reply: talk('claude', 10),
  }
}
