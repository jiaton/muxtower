import type { ConversationItem } from '@/lib/api/types'

/** What the conversation shows: items, and runs of tool calls folded into one line. */
export type Row = { kind: 'item'; item: ConversationItem } | { kind: 'tools'; items: ConversationItem[] }

export function conversationRows(items: ConversationItem[]): Row[] {
  const out: Row[] = []
  for (const item of items) {
    const last = out[out.length - 1]
    if (item.kind === 'tool' && last?.kind === 'tools') last.items.push(item)
    else if (item.kind === 'tool') out.push({ kind: 'tools', items: [item] })
    else if (item.kind !== 'result') out.push({ kind: 'item', item })
  }
  return out
}

/** A tool's name for people: MCP tools (`mcp__<server>__<tool>`) by their own name. */
export const toolName = (tool: ConversationItem) => (tool.tool_name ?? 'tool').replace(/^mcp__.+?__/, '').replaceAll('_', ' ')

const firstLine = (text: string | null | undefined, max = 60) => {
  const line = (text ?? '').split('\n')[0].trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}
const baseName = (path: string | null | undefined) => (path ?? '').split('/').filter(Boolean).pop() ?? ''

/** What a kind of tool call does, as a verb phrase for one call (with its target) and for several. */
interface Activity {
  one: (tool: ConversationItem) => string
  many: (n: number) => string
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const ACTIVITIES: Record<string, Activity> = {
  command: { one: (t) => `Ran ${firstLine(t.text)}`, many: (n) => `ran ${plural(n, 'command')}` },
  read: { one: (t) => `Read ${baseName(t.text)}`, many: (n) => `read ${plural(n, 'file')}` },
  edit: { one: (t) => `Edited ${baseName(t.text)}`, many: (n) => `edited ${plural(n, 'file')}` },
  search: { one: (t) => `Searched for ${firstLine(t.text, 40)}`, many: (n) => `searched ${plural(n, 'time')}` },
  web: { one: (t) => `Searched the web for ${firstLine(t.text, 40)}`, many: (n) => `searched the web ${plural(n, 'time')}` },
  fetch: { one: (t) => `Fetched ${firstLine(t.text, 50)}`, many: (n) => `fetched ${plural(n, 'page')}` },
  agent: { one: (t) => `Ran an agent: ${firstLine(t.text, 50)}`, many: (n) => `ran ${plural(n, 'agent')}` },
  plan: { one: () => 'Updated the plan', many: () => 'updated the plan' },
}
const KIND_OF: Record<string, keyof typeof ACTIVITIES> = {
  Bash: 'command', PowerShell: 'command', BashOutput: 'command',
  Read: 'read', NotebookRead: 'read',
  Edit: 'edit', MultiEdit: 'edit', Write: 'edit', NotebookEdit: 'edit',
  Grep: 'search', Glob: 'search', LS: 'search',
  WebSearch: 'web', WebFetch: 'fetch',
  Task: 'agent', Agent: 'agent',
  TodoWrite: 'plan',
}
const activityOf = (tool: ConversationItem): Activity => {
  const kind = KIND_OF[tool.tool_name ?? ''] ?? (/plan/i.test(tool.tool_name ?? '') ? 'plan' : undefined)
  if (kind) return ACTIVITIES[kind]
  const name = toolName(tool)
  return { one: () => `Used ${name}`, many: (n) => (n === 1 ? `used ${name}` : `used ${name} ${n} times`) }
}

/** One line for a run of tool calls, like "Ran 4 commands, read 2 files": a single call is told by its
 *  own description when the agent gave one, else by what it did to what. Failures are counted apart. */
export function toolRunSummary(tools: ConversationItem[]): { text: string; failed: number; running: boolean } {
  const failed = tools.filter((t) => t.status === 'error').length
  const running = tools.some((t) => t.status === 'running')
  if (tools.length === 1) {
    const [tool] = tools
    return { text: tool.description ?? activityOf(tool).one(tool), failed, running }
  }
  const counts = new Map<string, { activity: Activity; n: number }>()
  for (const tool of tools) {
    const activity = activityOf(tool)
    const key = activity.many(2) // one entry per activity, in the order they first ran
    const entry = counts.get(key) ?? { activity, n: 0 }
    entry.n += 1
    counts.set(key, entry)
  }
  const text = [...counts.values()].map(({ activity, n }) => activity.many(n)).join(', ')
  return { text: text.charAt(0).toUpperCase() + text.slice(1), failed, running }
}
