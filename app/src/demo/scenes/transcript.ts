import type { ConversationItem } from '@/lib/api/types'
import { ago, prompt, reply, tool } from './session'
import { type Line, answered, codexAnswered, codexDid, codexSaid, ran, said } from './terminal'

type ToolTurn = { tool: 'Read' | 'Edit' | 'Write' | 'Bash' | 'Grep'; on: string; description?: string; result: string[] }
/** One part of a session's earlier work: the owner's message, the agent's answer, or a tool it ran (what
 *  it ran on, a line saying what it is for, and what it printed). */
export type Turn = { you: string; minutesAgo?: number } | { says: string } | ToolTurn

export const you = (text: string, minutesAgo?: number): Turn => ({ you: text, minutesAgo })
export const says = (text: string): Turn => ({ says: text })
export const read = (path: string, lines: number): Turn => ({ tool: 'Read', on: path, result: [`Read ${lines} lines`] })
export const grep = (pattern: string, files: number): Turn => ({
  tool: 'Grep',
  on: pattern,
  result: [`Found ${files} file${files === 1 ? '' : 's'}`],
})
export const edit = (path: string, added: number, removed = 0): Turn => ({
  tool: 'Edit',
  on: path,
  result: [
    `Updated ${path} with ${added} addition${added === 1 ? '' : 's'}${removed ? ` and ${removed} removal${removed === 1 ? '' : 's'}` : ''}`,
  ],
})
export const write = (path: string, lines: number): Turn => ({ tool: 'Write', on: path, result: [`Wrote ${lines} lines to ${path}`] })
export const bash = (command: string, description: string, ...result: string[]): Turn => ({
  tool: 'Bash',
  on: command,
  description,
  result,
})

/** What Claude Code calls each tool on its screen. */
const CLAUDE_TITLE: Record<string, string> = { Edit: 'Update', Grep: 'Search' }

function codexLines(turn: ToolTurn): Line[] {
  if (turn.tool === 'Bash') return codexDid(`Ran ${turn.on}`, ...turn.result)
  if (turn.tool === 'Read' || turn.tool === 'Grep') return codexDid('Explored', `${turn.tool === 'Read' ? 'Read' : 'Search'} ${turn.on}`)
  return codexDid(turn.result[0] ?? `Edited ${turn.on}`)
}

/** The screen lines and conversation items of `turns`, numbered from `seq`; `next` is the seq after them. */
export function transcript(agent: 'claude' | 'codex', turns: Turn[], seq = 1) {
  const history: Line[] = []
  const items: ConversationItem[] = []
  for (const turn of turns) {
    const n = seq + items.length
    if ('you' in turn) {
      history.push(...(agent === 'codex' ? codexSaid(turn.you) : said(turn.you)))
      items.push(prompt(n, { text: turn.you, at: turn.minutesAgo === undefined ? null : ago(turn.minutesAgo) }))
    } else if ('says' in turn) {
      history.push(...(agent === 'codex' ? codexAnswered(turn.says) : answered(turn.says)))
      items.push(reply(n, { text: turn.says }))
    } else {
      const title = `${CLAUDE_TITLE[turn.tool] ?? turn.tool}(${turn.on})`
      history.push(...(agent === 'codex' ? codexLines(turn) : ran(title, ...turn.result)))
      items.push(tool(n, { tool_name: turn.tool, text: turn.on, description: turn.description ?? null, status: 'done' }))
    }
  }
  return { history, items, next: seq + items.length }
}
