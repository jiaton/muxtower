import { describe, expect, it } from 'vitest'
import { ansiToLines } from './ansi'

describe('ansiToLines', () => {
  it('splits lines and escapes HTML', () => {
    expect(ansiToLines('a<b>\nc & d')).toEqual(['a&lt;b&gt;', 'c &amp; d'])
  })

  it('maps basic colors to tokens and keeps style across lines until reset', () => {
    const [first, second, third] = ansiToLines('\x1b[1;31mred\nstill\x1b[0m\nplain')
    expect(first).toBe('<span class="font-semibold" style="color:var(--color-term-1)">red</span>')
    expect(second).toContain('still')
    expect(second).toContain('--color-term-1')
    expect(third).toBe('plain')
  })

  it('handles 256-color, true color and inverse', () => {
    expect(ansiToLines('\x1b[38;5;246mx')[0]).toContain('rgb(')
    expect(ansiToLines('\x1b[48;2;1;2;3my')[0]).toContain('background-color:rgb(1, 2, 3)')
    expect(ansiToLines('\x1b[7mz')[0]).toContain('background-color:var(--color-terminal-fg)')
  })

  it('drops other escape sequences', () => {
    expect(ansiToLines('a\x1b[2Kb\x1b]0;title\x07c')).toEqual(['abc'])
  })
})
