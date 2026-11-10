import { describe, expect, it } from 'vitest'
import type { ConversationItem } from './api/types'
import { CONFIRM_MS, GRACE_MS, confirmed, newestSeq, stateOf, type Outgoing } from './outbox'

const prompt = (seq: number, text: string): ConversationItem => ({ seq, kind: 'prompt', text })
const reply = (seq: number): ConversationItem => ({ seq, kind: 'reply', text: 'ok' })
const message = (id: string, text: string, afterSeq: number, sending = false): Outgoing => ({ id, text, afterSeq, sentAt: 0, sending })

describe('confirmed', () => {
  it('is confirmed by a later prompt with its text, not by the same words said before', () => {
    const items = [prompt(1, 'continue'), reply(2)]
    expect(confirmed([message('a', 'continue', 2)], items)).toEqual(new Map())
    expect(confirmed([message('a', 'continue', 2)], [...items, prompt(3, 'continue')])).toEqual(new Map([['a', 3]]))
  })

  it('reads text spaced otherwise as the same, and lets each prompt confirm one message', () => {
    const sent = [message('a', 'go on', 0), message('b', 'go on', 0)]
    expect(confirmed(sent, [prompt(1, '  go\non ')])).toEqual(new Map([['a', 1]]))
    expect(confirmed(sent, [prompt(1, 'go on'), prompt(2, 'go on')])).toEqual(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    )
  })

  it('reads pasted text as typed: wrapped in tags, or kept only as a placeholder', () => {
    const text = 'Please look at this:\n\nfirst line\n\n  second line'
    const wrapped = 'Please look at this:\n\n<pasted_content id="ab12">\nfirst line\n\nsecond line\n</pasted_content id="ab12">'
    expect(confirmed([message('a', text, 0)], [prompt(1, wrapped)])).toEqual(new Map([['a', 1]]))
    expect(confirmed([message('a', text, 0)], [prompt(1, 'Please look at this: [Pasted text #1 +3 lines]')])).toEqual(new Map([['a', 1]]))
    expect(confirmed([message('a', 'first', 0)], [prompt(1, '[Pasted text #1]')])).toEqual(new Map([['a', 1]]))
  })

  it('takes queued messages in order, and leaves them for a prompt typed some other way', () => {
    const sent = [message('a', 'run the tests', 0), message('b', 'then deploy', 0)]
    expect(confirmed(sent, [prompt(1, 'what is the weather')])).toEqual(new Map()) // typed in the terminal
    expect(confirmed(sent, [prompt(1, 'what is the weather'), prompt(2, 'run the tests')])).toEqual(new Map([['a', 2]]))
    expect(confirmed(sent, [prompt(2, 'run the tests'), prompt(3, 'then deploy')])).toEqual(
      new Map([
        ['a', 2],
        ['b', 3],
      ]),
    )
  })

  it('does not take a prompt that confirmed one message for another', () => {
    const sent = [{ ...message('a', 'hi', 1), seq: 2 }, message('b', 'again', 1)]
    expect(confirmed(sent, [prompt(1, 'hi'), prompt(2, 'hi')])).toEqual(new Map())
  })
})

it('is queued while the agent works, and not delivered a moment after it stopped without it', () => {
  const queued = { ...message('a', 'x', 0), sentAt: 1000, queued: true }
  expect(stateOf(queued, CONFIRM_MS * 5, null)).toBe('queued') // still working: still in its queue
  expect(stateOf(queued, 5000, 4000)).toBe('queued') // stopped a moment ago: it may yet be recorded
  expect(stateOf(queued, 4000 + GRACE_MS, 4000)).toBe('undelivered')
  expect(stateOf(message('a', 'x', 0), GRACE_MS, 0)).toBe('undelivered') // sent to an idle session that never took it
  expect(stateOf(message('a', 'x', 0, true), GRACE_MS * 9, 0)).toBe('sending')
})

it('is sending, then waiting, then unconfirmed after a minute', () => {
  expect(stateOf(message('a', 'x', 0, true), CONFIRM_MS * 2)).toBe('sending')
  expect(stateOf(message('a', 'x', 0), CONFIRM_MS - 1)).toBe('waiting')
  expect(stateOf(message('a', 'x', 0), CONFIRM_MS)).toBe('unconfirmed')
  expect(newestSeq(undefined)).toBe(-1)
  expect(newestSeq([prompt(4, 'a'), reply(9)])).toBe(9)
})
