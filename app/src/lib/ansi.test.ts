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

  it('gives non-ASCII exactly its cells: CJK scaled to two each, other wide characters and runs boxed', () => {
    expect(gridHtml('ab')).toBe('ab')
    expect(gridHtml('中文')).toBe('<span class="term-wide">中文</span>')
    expect(gridHtml('x──y')).toBe('x<span class="inline-block overflow-hidden align-top" style="width:2ch">──</span>y')
    expect(gridHtml('🚀')).toBe('<span class="inline-block overflow-hidden align-top" style="width:2ch">🚀</span>') // its own font: boxed
    expect(gridHtml('好，ok')).toBe('<span class="term-wide">好，</span>ok') // full-width punctuation scales with it
  })

  it('every line takes exactly the cells tmux gives it: prose, a prompt padded with spaces, a table, a status', () => {
    const lines = [
      '● 好的。我先读了 src/config.ts：parseConfig 同时做了三件事',
      '\x1b[48;5;237m> 帮我把这个函数重构一下，然后跑测试          \x1b[0m',
      '│ 读取配置   │ \x1b[32m通过\x1b[0m     │ 12 ms        │',
      '┌────────────┬──────────┐',
      '  ⏵⏵ 接受编辑 accept edits on · 上下文 42% 🚀',
      '日本語のテキスト と 한국어 텍스트',
    ]
    for (const line of lines) {
      const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
      expect(cellsOf(ansiToLines(line)[0]!)).toBe(textCells(plain))
    }
  })

  it('keeps Claude Code’s own lines in their cells: bullet, frames, prompt, status', () => {
    for (const line of ['● Done.', '╭───╮', '│ > │', '╰───╯', '⏵⏵ accept edits on', '✻ Thinking…']) {
      expect(cellsOf(ansiToLines(line)[0]!)).toBe(textCells(line))
    }
  })
})

/** The cells a line's HTML takes as the terminal view draws it: ASCII one each, `term-wide` characters two
 *  each, a box its width. */
function cellsOf(html: string): number {
  const root = document.createElement('div')
  root.innerHTML = html
  let cells = 0
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return void (cells += [...(node.textContent ?? '')].length)
    const el = node as HTMLElement
    if (el.classList?.contains('term-wide')) return void (cells += [...(el.textContent ?? '')].length * 2)
    const width = el.style?.width?.match(/^(\d+)ch$/)
    if (width) return void (cells += Number(width[1]))
    node.childNodes.forEach(walk)
  }
  root.childNodes.forEach(walk)
  return cells
}

describe('textCells', () => {
  it('counts wide, narrow and zero-width characters like wcwidth', () => {
    expect(textCells('abc')).toBe(3)
    expect(textCells('中文')).toBe(4)
    expect(textCells('✻ ● ─')).toBe(5)
    expect(textCells('🚀')).toBe(2)
    expect(textCells('é')).toBe(1) // e + combining acute
  })
})
