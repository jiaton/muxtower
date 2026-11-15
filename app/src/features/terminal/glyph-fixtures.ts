/**
 * Torture screens for the terminal view (made up, nothing from a real session): each one a class of
 * glyph that has to tile without seams, and the checks the pixel suite (`e2e/glyphs.spec.ts`) runs on it.
 * A new rendering issue becomes a fixture here plus a rule in the glyph classes (app/AGENTS.md), never a
 * one-off patch. Lines are ANSI, laid out in cells exactly as tmux would show them.
 */
import { textCells } from '@/lib/cell-width'

/** Cells that must be filled edge to edge with the colour at their middle: no seam with a filled
 *  neighbour, across a column or a row. */
export interface Solid {
  row: number
  from: number
  to: number // inclusive
  /** Cells of one fill: only neighbours in the same group must meet without a seam. */
  group?: string
}

/** A vertical line through the middle of `col`, unbroken from the middle of row `from` to row `to`. */
export interface VLine {
  col: number
  from: number
  to: number
}

export interface Fixture {
  name: string
  /** Its lines for a pane `cols` wide. */
  lines: (cols: number) => string[]
  solids: Solid[]
  vlines: VLine[]
  /** A row whose last cell (column cols - 1) is an `X`: where text and grid are compared (drift). */
  driftRow?: number
}

const E = '\x1b'
const fg = (code: string, text: string) => `${E}[38;5;${code}m${text}${E}[0m`
const bg = (code: string, text: string) => `${E}[48;5;${code}m${text}${E}[0m`
/** `text` padded with spaces to `cols` cells. */
const pad = (text: string, cols: number) => text + ' '.repeat(Math.max(0, cols - textCells(text)))
const row = (r: number, from: number, to: number, group?: string): Solid => ({ row: r, from, to, group })

export const FIXTURES: Fixture[] = [
  {
    name: 'logo', // Claude Code's welcome creature, in block elements and colour
    lines: () => [fg('209', ' ▐▛███▜▌'), fg('209', '▝▜█████▛▘'), fg('209', '  ▘▘ ▝▝')],
    solids: [row(0, 3, 5), row(1, 2, 6)],
    vlines: [],
  },
  {
    name: 'frames', // light, heavy, double and rounded frames, and a table with CJK cells
    lines: () => [
      '┌──────┐ ┏━━━━━━┓ ╔══════╗ ╭──────╮',
      '│ 表格 │ ┃ heavy┃ ║double║ │ round│',
      '│ 中文 │ ┃ 粗线 ┃ ║ 双线 ║ │ 圆角 │',
      '└──────┘ ┗━━━━━━┛ ╚══════╝ ╰──────╯',
      '┌────┬────┐',
      '│ 读 │ ok │',
      '├────┼────┤',
      '│ ab │ 写 │',
      '└────┴────┘',
    ],
    solids: [],
    vlines: [
      { col: 0, from: 0, to: 3 },
      { col: 7, from: 0, to: 3 },
      { col: 9, from: 0, to: 3 },
      { col: 18, from: 0, to: 3 },
      { col: 27, from: 0, to: 3 },
      { col: 0, from: 4, to: 8 },
      { col: 5, from: 4, to: 8 },
      { col: 10, from: 4, to: 8 },
    ],
  },
  {
    name: 'blocks', // every block element, then a solid block
    lines: () => [
      [...Array(16)].map((_, i) => String.fromCodePoint(0x2580 + i)).join(' '),
      [...Array(16)].map((_, i) => String.fromCodePoint(0x2590 + i)).join(' '),
      '',
      '██████',
      '██████',
      '██████',
    ],
    solids: [row(3, 0, 5), row(4, 0, 5), row(5, 0, 5)],
    vlines: [],
  },
  {
    name: 'shades', // light, medium and dark shade and full block, two rows each
    lines: () => ['░░░░░░░░', '░░░░░░░░', '▒▒▒▒▒▒▒▒', '▒▒▒▒▒▒▒▒', '▓▓▓▓▓▓▓▓', '▓▓▓▓▓▓▓▓', '████████', '████████'],
    solids: [0, 1, 2, 3, 4, 5, 6, 7].map((r) => row(r, 0, 7)),
    vlines: [],
  },
  {
    name: 'mixed', // CJK, emoji and ASCII on one row up to its last cell
    lines: (cols) => {
      let text = ''
      const parts = ['状态 ', '💗 ', 'ok ', '完成 ', '❤️ ', 'abc ', '表格 ', '✅ ', '中文 ', '→ ']
      for (let i = 0; textCells(text) < cols - 4; i++) text += parts[i % parts.length]
      while (textCells(text) > cols - 1) text = [...text].slice(0, -1).join('')
      return [pad(text, cols - 1) + 'X', pad('中文汉字终端宽度测试', cols - 1) + 'X']
    },
    solids: [],
    vlines: [],
    driftRow: 0,
  },
  {
    name: 'backgrounds', // a block of background across wrapped rows (text, then blank), and an inverse run
    lines: (cols) => [
      bg('237', pad('> 帮我把这个函数重构一下，拆成读取和校验两部', cols)),
      bg('237', pad('', cols)),
      bg('237', pad('', cols)),
      bg('237', pad('', cols)),
      `${E}[7m${pad('', 20)}${E}[0m`,
      `${E}[7m${pad('', 20)}${E}[0m`,
    ],
    solids: [row(1, 0, 45, 'grey'), row(2, 0, 45, 'grey'), row(3, 0, 45, 'grey'), row(4, 0, 19, 'inverse'), row(5, 0, 19, 'inverse')],
    vlines: [],
  },
  {
    name: 'powerline', // segments joined by Powerline separators
    lines: () => {
      const line = (a: string, b: string) =>
        `${E}[48;5;24m${E}[38;5;255m${a}${E}[48;5;238m${E}[38;5;24m\ue0b0${E}[38;5;252m${b}${E}[0m${E}[38;5;238m\ue0b0${E}[0m`
      return [line(' main ', ' dirty '), line('      ', '       '), line('      ', '       ')]
    },
    solids: [row(1, 0, 5, 'main'), row(2, 0, 5, 'main'), row(1, 7, 13, 'dirty'), row(2, 7, 13, 'dirty')],
    vlines: [],
  },
  {
    name: 'eighths', // a progress bar ending in eighths, over a full one
    lines: () => ['█████▉▊▋▌▍▎▏', '████████████', '████████████'],
    solids: [row(0, 0, 4), row(1, 0, 11), row(2, 0, 11)],
    vlines: [],
  },
]
