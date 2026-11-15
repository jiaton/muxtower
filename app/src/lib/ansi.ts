/**
 * ANSI (SGR) text → one HTML string per line, for the terminal view. The 16 basic colors come from the
 * terminal tokens; 256-color and true-color codes are the agent's own choice and are passed through as
 * rgb() values (this file is allow-listed by scripts/check-tokens.mjs for that reason).
 */
import { cellWidth, textCells } from './cell-width'

interface Style {
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  strike?: boolean
}

const basic = (n: number) => `var(--color-term-${n})`

function color256(n: number): string {
  if (n < 16) return basic(n)
  if (n < 232) {
    const level = (x: number) => (x === 0 ? 0 : 55 + x * 40)
    const i = n - 16
    return `rgb(${level(Math.floor(i / 36))}, ${level(Math.floor(i / 6) % 6)}, ${level(i % 6)})`
  }
  const v = 8 + (n - 232) * 10
  return `rgb(${v}, ${v}, ${v})`
}

function applySgr(style: Style, params: number[]): Style {
  const s = { ...style }
  if (params.length === 0) params = [0]
  for (let i = 0; i < params.length; i++) {
    const p = params[i]
    if (p === 0) Object.keys(s).forEach((k) => delete s[k as keyof Style])
    else if (p === 1) s.bold = true
    else if (p === 2) s.dim = true
    else if (p === 3) s.italic = true
    else if (p === 4) s.underline = true
    else if (p === 7) s.inverse = true
    else if (p === 9) s.strike = true
    else if (p === 22) s.bold = s.dim = false
    else if (p === 23) s.italic = false
    else if (p === 24) s.underline = false
    else if (p === 27) s.inverse = false
    else if (p === 29) s.strike = false
    else if (p >= 30 && p <= 37) s.fg = basic(p - 30)
    else if (p >= 90 && p <= 97) s.fg = basic(p - 90 + 8)
    else if (p >= 40 && p <= 47) s.bg = basic(p - 40)
    else if (p >= 100 && p <= 107) s.bg = basic(p - 100 + 8)
    else if (p === 39) delete s.fg
    else if (p === 49) delete s.bg
    else if (p === 38 || p === 48) {
      let value: string | undefined
      if (params[i + 1] === 5 && params[i + 2] !== undefined) {
        value = color256(params[i + 2])
        i += 2
      } else if (params[i + 1] === 2 && params[i + 4] !== undefined) {
        value = `rgb(${params[i + 2]}, ${params[i + 3]}, ${params[i + 4]})`
        i += 4
      }
      if (value) s[p === 38 ? 'fg' : 'bg'] = value
    }
  }
  return s
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ASCII is drawn by the monospace font itself; anything else may come from a fallback font of another
// width, so it gets exactly the cells tmux gives it (see cell-width.ts), and every line adds up to the
// pane's columns:
// - a CJK character (and full-width punctuation) is drawn in its own font scaled so that it is exactly two
//   cells wide (`term-wide`, tokens.css: the scale is measured in this browser by the terminal view, 2ch
//   over the glyph's own width), its line height kept to the row's: no box, no gap, nothing left over;
// - another wide character (an emoji, a symbol) is boxed in its two cells, a glyph of its own font;
// - a run of box drawing and blocks (U+2500–259F: rules, frames, a table's borders) is boxed in its cells
//   and stretched to the row's height (`term-box`, tokens.css; the stretch measured by the terminal view),
//   so a │ meets the one in the row above and below;
// - a run of other non-ASCII (an accent, a symbol) is boxed in its cells.
// The boxes clip: a glyph drawn wider than its cells would otherwise widen the view past the pane and let
// it scroll sideways. Aligned to the top, since a clipping inline box sits on its bottom edge instead of
// the text's baseline.
const NON_ASCII = /[^\x00-\x7f]+/g

/** CJK scripts and full-width forms: what one scale of the CJK fallback font draws two cells wide. */
const CJK: [number, number][] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x3fffd],
]
export const isCjk = (code: number) => CJK.some(([from, to]) => code >= from && code <= to)

const box = (text: string, cells: number, extra = '') =>
  `<span class="inline-block overflow-hidden align-top${extra}" style="width:${cells}ch">${escapeHtml(text)}</span>`
const isBoxDrawing = (code: number) => code >= 0x2500 && code <= 0x259f

function cellsHtml(run: string): string {
  let html = ''
  let narrow = ''
  let lines = '' // box drawing, stretched to the row
  let cjk = ''
  const flush = () => {
    if (narrow) html += box(narrow, textCells(narrow))
    if (lines) html += box(lines, textCells(lines), ' term-box')
    if (cjk) html += `<span class="term-wide">${escapeHtml(cjk)}</span>`
    narrow = ''
    lines = ''
    cjk = ''
  }
  for (const char of run) {
    const code = char.codePointAt(0)!
    if (cellWidth(code) !== 2 && isBoxDrawing(code)) {
      if (cjk || narrow) flush()
      lines += char
    } else if (cellWidth(code) !== 2) {
      if (cjk || lines) flush()
      narrow += char
    } else if (isCjk(code)) {
      if (narrow || lines) flush()
      cjk += char
    } else {
      flush()
      html += box(char, 2) // an emoji or a wide symbol: its own font, in its two cells
    }
  }
  flush()
  return html
}

/** Plain text → HTML in which non-ASCII text takes exactly its terminal cells. */
export function gridHtml(text: string): string {
  let html = ''
  let at = 0
  for (const match of text.matchAll(NON_ASCII)) {
    html += escapeHtml(text.slice(at, match.index)) + cellsHtml(match[0])
    at = match.index + match[0].length
  }
  return html + escapeHtml(text.slice(at))
}

function wrap(text: string, s: Style, html = gridHtml(text)): string {
  const fg = s.inverse ? (s.bg ?? 'var(--color-terminal-bg)') : s.fg
  const bg = s.inverse ? (s.fg ?? 'var(--color-terminal-fg)') : s.bg
  const classes = [
    s.bold && 'font-semibold',
    s.dim && 'opacity-60',
    s.italic && 'italic',
    s.underline && 'underline',
    s.strike && 'line-through',
  ]
    .filter(Boolean)
    .join(' ')
  // A background fills its row, top to bottom (an inline run's would stop at its text, a seam showing
  // between the rows of a block of them): a box as tall as the row, at its top, as wide as its text, and a
  // pixel into the next (a row's height in device pixels is rarely whole: no hairline where they meet).
  const css = [
    fg && `color:${fg}`,
    bg && `background-color:${bg};display:inline-block;vertical-align:top;padding-bottom:1px;margin-bottom:-1px`,
  ]
    .filter(Boolean)
    .join(';')
  if (!classes && !css) return html
  return `<span${classes ? ` class="${classes}"` : ''}${css ? ` style="${css}"` : ''}>${html}</span>`
}

// SGR, any other CSI, OSC (BEL or ST terminated), newlines, plain text.
const TOKEN = /\x1b\[([0-9;:]*)m|\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b.?|\r|\n|[^\x1b\r\n]+/g

interface Run {
  text: string
  style: Style
}

/** A line's styled runs → HTML: each run as `gridHtml` draws it, so the line takes exactly its cells. */
export function lineHtml(runs: Run[]): string {
  return runs.map((r) => wrap(r.text, r.style)).join('')
}

export function ansiToLines(text: string): string[] {
  const lines: string[] = []
  let line: Run[] = []
  let style: Style = {}
  for (const match of text.matchAll(TOKEN)) {
    const token = match[0]
    if (token === '\n') {
      lines.push(lineHtml(line))
      line = []
    } else if (match[1] !== undefined) {
      style = applySgr(
        style,
        match[1]
          .split(/[;:]/)
          .filter((x) => x !== '')
          .map(Number),
      )
    } else if (token[0] !== '\x1b' && token !== '\r') {
      line.push({ text: token, style })
    }
  }
  lines.push(lineHtml(line))
  return lines
}
