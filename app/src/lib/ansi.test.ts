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

  it('gives non-ASCII runs exactly the cells tmux gives them, clipped to them', () => {
    expect(gridHtml('ab')).toBe('ab')
    const run = (text: string, cells: number) =>
      `<span class="inline-block overflow-hidden align-top" style="width:${cells}ch">${text}</span>`
    expect(gridHtml('x──y')).toBe(`x${run('──', 2)}y`)
    expect(gridHtml('会话 ok')).toBe(`${run('会话', 4)} ok`) // a run of wide characters: one box, two cells each
    expect(gridHtml('<中>')).toBe(`&lt;${run('中', 2)}&gt;`)
    expect(gridHtml('●中')).toBe(`${run('●', 1)}${run('中', 2)}`)
    expect(gridHtml('中●文')).toBe(`${run('中', 2)}${run('●', 1)}${run('文', 2)}`)
    expect(gridHtml('𠀀a')).toBe(`${run('𠀀', 2)}a`) // outside the BMP: still one character, two cells
  })

  // Boxes add up to the cells tmux gives a line, so what follows a CJK run (a table's next column, a rule)
  // starts where it does in the terminal, however tight the run itself is drawn.
  const cellsOf = (html: string) => {
    const boxed = [...html.matchAll(/style="width:(\d+)ch">([^<]*)<\/span>/g)]
    const outside = html.replace(/<span[^>]*>[^<]*<\/span>/g, '').replace(/&(lt|gt|amp);/g, '_')
    return boxed.reduce((n, m) => n + Number(m[1]), 0) + outside.length
  }
  it('keeps the columns after a CJK run where the terminal has them: tables and rules', () => {
    const table = ['│ 名称       │ ok │', '│ abc        │ ok │', '│ 中文名称   │ no │']
    for (const line of table) expect(cellsOf(gridHtml(line))).toBe(textCells(line))
    expect(new Set(table.map((line) => textCells(line))).size).toBe(1) // all three the same width: aligned
    const rule = '会话 ─────── done'
    expect(cellsOf(gridHtml(rule))).toBe(textCells(rule))
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
