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

  // A rendered line's cells: each box its width, text outside boxes its terminal cells. Equal to the
  // cells tmux gives the line, whatever is drawn tight inside the boxes: what follows a box keeps its column.
  const cellsOf = (html: string) => {
    const walk = (node: Node): number => {
      if (node.nodeType === Node.TEXT_NODE) return textCells(node.textContent ?? '')
      const width = (node as HTMLElement).style?.width
      if (width?.endsWith('ch')) return Number(width.slice(0, -2))
      return [...node.childNodes].reduce((n, c) => n + walk(c), 0)
    }
    const div = document.createElement('div')
    div.innerHTML = html
    return walk(div)
  }
  const boxes = (html: string) => (html.match(/style="width:/g) ?? []).length
  const line = (text: string) => ansiToLines(text)[0]!

  it('draws prose that mixes Chinese and English tight: no gap after a Chinese run', () => {
    for (const prose of [
      '最后再几条消息,因为我 history有点长,我看不过来了,你 architecture上面是不是已经改好了?',
      '对,架构上该改的都已经改好了, 0.1.93 已经上线。',
    ]) {
      const html = line(prose)
      expect(boxes(html)).toBe(1) // one segment, its leftover at the line's end
      expect(cellsOf(html)).toBe(textCells(prose))
    }
  })

  it('keeps a table’s borders, a list’s columns and a rule where the terminal has them', () => {
    const table = ['│ 名称       │ 状态 │', '│ abc        │ ok   │', '│ 中文名称   │ 完成 │']
    for (const row of table) expect(cellsOf(line(row))).toBe(textCells(row))
    expect(new Set(table.map(textCells)).size).toBe(1)
    const list = ['名称    状态', 'abc     ok', '中文名  完成'] // two spaces or more: a column
    for (const row of list) {
      const html = line(row)
      expect(cellsOf(html)).toBe(textCells(row))
      const first = row.split(/ {2,}/)[0]!
      const div = document.createElement('div')
      div.innerHTML = html
      const lead = div.firstElementChild as HTMLElement | null
      if (/[^\x00-\x7f]/.test(first)) expect(lead?.style.width).toBe(`${textCells(first)}ch`) // ends on its column
    }
    expect(cellsOf(line('会话 ─────── done'))).toBe(textCells('会话 ─────── done'))
  })

  it('keeps Claude Code’s own lines in their cells: bullet, frames, prompt, status', () => {
    for (const ui of [
      '⏺ 好的,已经更新了发布说明。',
      '╭──────────────╮',
      '│ › 你好,继续 │',
      '╰──────────────╯',
      '  esc to interrupt · 中文输入',
    ]) {
      expect(cellsOf(line(ui))).toBe(textCells(ui))
    }
  })

  it('draws a segment that changes color midway as one, the last color filling what it leaves over', () => {
    const html = line('改好了 \x1b[36m0.1.93\x1b[0m 已经上线')
    expect(boxes(html)).toBe(1)
    expect(html).toContain('color:')
    const highlighted = line('\x1b[7m› 你好\x1b[0m')
    expect(highlighted).toMatch(/width:\d+ch;background-color:/)
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
