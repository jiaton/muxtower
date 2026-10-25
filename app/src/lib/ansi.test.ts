import { describe, expect, it } from 'vitest'
import { ansiToLines, gridHtml } from './ansi'
import { textCells } from './cell-width'

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

  it('gives non-ASCII runs exactly the cells tmux gives them', () => {
    expect(gridHtml('ab')).toBe('ab')
    expect(gridHtml('x──y')).toBe('x<span class="inline-block" style="width:2ch">──</span>y')
    const wide = (c: string) => `<span class="inline-block w-[2ch] text-center">${c}</span>`
    expect(gridHtml('会话 ok')).toBe(`${wide('会')}${wide('话')} ok`)
    expect(gridHtml('<中>')).toBe(`&lt;${wide('中')}&gt;`)
    expect(gridHtml('●中')).toBe(`<span class="inline-block" style="width:1ch">●</span>${wide('中')}`)
  })
})

describe('textCells', () => {
  it('counts wide, narrow and zero-width characters like wcwidth', () => {
    expect(textCells('abc')).toBe(3)
    expect(textCells('中文')).toBe(4)
    expect(textCells('✻ ● ─')).toBe(5)
    expect(textCells('🚀')).toBe(2)
    expect(textCells('é')).toBe(1) // e + combining acute
  })
})
