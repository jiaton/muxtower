import type { Step } from '../world'
import { DEMO_ANSWER, prompt, reply } from './session'
import { answered, claudeInput, codexAnswered, codexInput, codexSaid, codexWorking, said, working } from './terminal'

/** How a session answers messages: the prompt shows, the agent works a moment, then says it is a demo.
 *  `screen`: which agent draws the terminal (none for a session without one). */
export function talk(screen: 'claude' | 'codex' | null, firstSeq: number) {
  let seq = firstSeq
  return (text: string): Step[] => {
    const asked = seq++
    const answer = seq++
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
        session: { state: 'idle', unread: true, last_message: DEMO_ANSWER, finished_at: new Date().toISOString() },
        add: screen === 'codex' ? codexAnswered(DEMO_ANSWER) : screen ? answered(DEMO_ANSWER) : undefined,
        footer: screen === 'codex' ? codexInput : screen ? claudeInput : undefined,
        items: [reply(answer, { text: DEMO_ANSWER })],
      },
    ]
  }
}
