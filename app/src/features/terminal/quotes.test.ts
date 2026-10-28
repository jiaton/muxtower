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
  it('puts the quotes first, as Markdown quotes, then what was typed', () => {
    expect(withQuotes(['Pick a date\n\nany day', 'Or 11/4'], ' 11/9 works ')).toBe('> Pick a date\n>\n> any day\n\n> Or 11/4\n\n11/9 works')
    expect(withQuotes([], 'hi')).toBe('hi')
    expect(withQuotes(['only this'], '')).toBe('> only this')
  })
})
