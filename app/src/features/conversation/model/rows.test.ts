import { describe, expect, it } from 'vitest'
import type { ConversationItem } from '@/lib/api/types'
import { conversationRows, toolName, toolRunSummary } from './rows'

let seq = 0
const tool = (tool_name: string, text: string, extra: Partial<ConversationItem> = {}): ConversationItem => ({
  seq: ++seq,
  kind: 'tool',
  tool_name,
  text,
  status: 'done',
  ...extra,
})
const reply = (text: string): ConversationItem => ({ seq: ++seq, kind: 'reply', text })

describe('conversationRows', () => {
  it('folds runs of tool calls between prose, and leaves out turn ends', () => {
    const rows = conversationRows([reply('a'), tool('Bash', 'ls'), tool('Read', '/x'), reply('b'), { seq: ++seq, kind: 'result' }])
    expect(rows.map((r) => (r.kind === 'tools' ? r.items.length : r.item.text))).toEqual(['a', 2, 'b'])
  })
})

describe('the next step the agent offers', () => {
  const step = (status: ConversationItem['status']): ConversationItem => ({
    seq: ++seq, kind: 'next_step', text: 'Read it.', ask: 'Start?', status, actions: [{ label: 'Start', message: 'Go.' }],
  }) // prettier-ignore

  it('comes last, after the closing reply, while nobody has answered it', () => {
    const rows = conversationRows([step('pending'), reply('Done reading.')])
    expect(rows.map((r) => r.kind)).toEqual(['item', 'next'])
  })

  it('goes once the owner wrote', () => {
    expect(conversationRows([step('answered'), reply('a')]).map((r) => r.kind)).toEqual(['item'])
  })
})

describe('toolRunSummary', () => {
  it("tells a single call by the agent's own description", () => {
    expect(toolRunSummary([tool('Bash', 'make check', { description: 'Run all checks' })]).text).toBe('Run all checks')
  })

  it('else by what it did to what', () => {
    expect(toolRunSummary([tool('Read', '/home/u/app/src/main.tsx')]).text).toBe('Read main.tsx')
    expect(toolRunSummary([tool('Bash', 'git status\ngit log')]).text).toBe('Ran git status')
  })

  it('counts several calls by kind, in the order they ran, and failures apart', () => {
    const summary = toolRunSummary([
      tool('Bash', 'a', { status: 'error' }),
      tool('Read', '/a'),
      tool('Bash', 'b'),
      tool('Edit', '/b'),
      tool('Bash', 'c', { status: 'error' }),
      tool('Bash', 'd'),
    ])
    expect(summary).toEqual({ text: 'Ran 4 commands, read 1 file, edited 1 file', failed: 2, running: false })
  })

  it('names MCP and other tools by their own name', () => {
    expect(toolName(tool('mcp__ccd_turn__wrap_up', '{}'))).toBe('wrap up')
    expect(toolRunSummary([tool('mcp__ccd_turn__update_plan', '{}'), tool('mcp__ccd_turn__wrap_up', '{}')]).text).toBe(
      'Updated the plan, used wrap up',
    )
  })

  it('says when a call is still running', () => {
    expect(toolRunSummary([tool('Bash', 'sleep 9', { status: 'running' })]).running).toBe(true)
  })
})

describe('Codex tool runs', () => {
  it('counts Codex tools like their Claude Code kin', () => {
    const run = [tool('exec_command', 'pytest -q'), tool('exec_command', 'ls'), tool('apply_patch', 'a.py'), tool('update_plan', '…')]
    expect(toolRunSummary(run).text).toBe('Ran 2 commands, edited 1 file, updated the plan')
  })
})
