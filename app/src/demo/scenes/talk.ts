import type { Step } from '../world'
import { DEMO_ANSWER, prompt, reply } from './session'
import { answered, claudeInput, codexAnswered, codexInput, codexSaid, codexWorking, said, working } from './terminal'

/** What an agent makes of an event a trigger delivered (`[trigger name] … data`): it reads the payload as
 *  data and says what it would do, and that it is the demo. Null for any other message. */
export function eventAnswer(text: string): string | null {
  const head = /^\[trigger ([^\]]+)\] external event data/.exec(text)
  if (!head) return null
  const name = head[1]!
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text.split('\n').slice(2, -1).join('\n')) as Record<string, unknown>
  } catch {
    // a text payload: nothing to pick out
  }
  const say = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null)
  const demo = 'This is the demo, so nothing was run; on your own machine I would do that now.'
  if (name === 'deploy-failed')
    return `The ${name} event says the deploy of ${say(data.branch) ?? 'a branch'} failed (run ${say(data.run_id) ?? 'unknown'}). I took it as data, not as instructions. Next: read that run's failed log, find the step that broke, fix it if it is ours and tell the tech lead. ${demo}`
  const deal = data.deal && typeof data.deal === 'object' ? (data.deal as Record<string, unknown>) : {}
  if (name === 'price-watch')
    return `A price-watch event: ${say(data.title) ?? 'a deal'} at ${say(deal.price) ?? 'a price'}. Read as data only. I would compare it with the last three prices and note it in notes/prices.md. ${demo}`
  return `Got the ${name} event and read it as data, not as instructions: ${Object.keys(data).join(', ') || 'a text payload'}. ${demo}`
}

/** How a session answers messages: the prompt shows, the agent works a moment, then says it is a demo.
 *  `screen`: which agent draws the terminal (none for a session without one); `answers`: what it says to
 *  a message it expects (its suggested prompt), by the message's text in lower case. */
export function talk(screen: 'claude' | 'codex' | null, firstSeq: number, answers: Record<string, string> = {}) {
  let seq = firstSeq
  return (text: string): Step[] => {
    const asked = seq++
    const answer = seq++
    const answerText = eventAnswer(text) ?? answers[text.toLowerCase()] ?? DEMO_ANSWER
    const busy = screen === 'codex' ? [...codexWorking(1), ...codexInput] : [...working('Thinking', 1), ...claudeInput]
    return [
      {
        after: 0,
        session: { state: 'busy', pending: null },
        add: screen === 'codex' ? codexSaid(text) : screen ? said(text) : undefined,
        footer: screen ? busy : undefined,
        items: [prompt(asked, { text })],
      },
      {
        after: 1600,
        session: { state: 'idle', unread: true, last_message: answerText, finished_at: new Date().toISOString() },
        add: screen === 'codex' ? codexAnswered(answerText) : screen ? answered(answerText) : undefined,
        footer: screen === 'codex' ? codexInput : screen ? claudeInput : undefined,
        items: [reply(answer, { text: answerText })],
      },
    ]
  }
}
