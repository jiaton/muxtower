import { describe, expect, it } from 'vitest'
import { quoteOf, withQuotes } from './quotes'

describe('quoteOf', () => {
  it("takes a terminal's frame and spare blank lines off what was selected", () => {
    expect(quoteOf('│ Design review two  │\n│                     │\n\n\n│ waits on a date     │\n')).toBe(
      'Design review two\n\nwaits on a date',
    )
    expect(quoteOf('  ── \n')).toBe('')
  })

  it('cuts a long selection short', () => {
    const long = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n')
    expect(quoteOf(long).split('\n')).toHaveLength(12)
    expect(quoteOf(long).endsWith('line 11 …')).toBe(true)
    expect(quoteOf('x'.repeat(2000))).toHaveLength(1202)
  })
})

describe('withQuotes', () => {
  it('puts the quotes first, as Markdown quotes each followed by its own reply, then what was typed', () => {
    const quotes = [
      { text: 'Pick a date\n\nany day', reply: ' 11/9-11/11 ' },
      { text: 'Jill has not answered', reply: '' },
    ]
    expect(withQuotes(quotes, ' the rest as you said ')).toBe(
      '> Pick a date\n>\n> any day\n\n11/9-11/11\n\n> Jill has not answered\n\nthe rest as you said',
    )
    expect(withQuotes([], 'hi')).toBe('hi')
    expect(withQuotes([{ text: 'only this', reply: '' }], '')).toBe('> only this')
  })
})
