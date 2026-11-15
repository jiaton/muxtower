import { describe, expect, it } from 'vitest'
import { ansiToLines } from '@/lib/ansi'
import { textCells } from '@/lib/cell-width'
import { FIXTURES } from './glyph-fixtures'

/** The cells a line's HTML takes as the terminal view draws it (as in lib/ansi.test.ts). */
function cellsOf(html: string): number {
  const root = document.createElement('div')
  root.innerHTML = html
  let cells = 0
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return void (cells += textCells(node.textContent ?? ''))
    const el = node as HTMLElement
    if (el.classList?.contains('term-wide')) return void (cells += [...(el.textContent ?? '')].length * 2)
    const width = el.style?.width?.match(/^(\d+)ch$/)
    if (width) return void (cells += Number(width[1]))
    node.childNodes.forEach(walk)
  }
  root.childNodes.forEach(walk)
  return cells
}

describe('glyph fixtures', () => {
  for (const fixture of FIXTURES) {
    for (const cols of [46, 96]) {
      it(`${fixture.name} at ${cols} cols: every line takes exactly the cells tmux counts`, () => {
        for (const line of fixture.lines(cols)) {
          const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
          expect(textCells(plain)).toBeLessThanOrEqual(cols)
          expect(cellsOf(ansiToLines(line)[0]!)).toBe(textCells(plain))
        }
        if (fixture.driftRow !== undefined) {
          const plain = fixture.lines(cols)[fixture.driftRow]!.replace(/\x1b\[[0-9;]*m/g, '')
          expect(textCells(plain)).toBe(cols) // its X is the last cell
          expect(plain.endsWith('X')).toBe(true)
        }
      })
    }
  }
})
