import { describe, expect, it } from 'vitest'
import type { ConversationItem } from './api/types'
import { CONFIRM_MS, confirmed, newestSeq, stateOf, type Outgoing } from './outbox'

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
    expect(confirmed(sent, [prompt(1, 'go on'), prompt(2, 'go on')])).toEqual(new Map([['a', 1], ['b', 2]]))
  })

  it('takes a later prompt worded otherwise for the oldest message sent before it', () => {
    const sent = [message('a', 'first', 0), message('b', 'second', 0), message('c', 'third', 5, true)]
    expect(confirmed(sent, [prompt(1, '[Pasted text #1]'), prompt(6, 'other')])).toEqual(new Map([['a', 1], ['b', 6]]))
  })

  it('does not take a prompt that confirmed one message for another', () => {
    const sent = [{ ...message('a', 'hi', 1), seq: 2 }, message('b', 'again', 1)]
    expect(confirmed(sent, [prompt(1, 'hi'), prompt(2, 'hi')])).toEqual(new Map())
  })
})

it('is sending, then waiting, then unconfirmed after a minute', () => {
  expect(stateOf(message('a', 'x', 0, true), CONFIRM_MS * 2)).toBe('sending')
  expect(stateOf(message('a', 'x', 0), CONFIRM_MS - 1)).toBe('waiting')
  expect(stateOf(message('a', 'x', 0), CONFIRM_MS)).toBe('unconfirmed')
  expect(newestSeq(undefined)).toBe(-1)
  expect(newestSeq([prompt(4, 'a'), reply(9)])).toBe(9)
})
