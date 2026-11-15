/**
 * ANSI (SGR) text → one HTML string per line, for the terminal view. The 16 basic colors come from the
 * terminal tokens; 256-color and true-color codes are the agent's own choice and are passed through as
 * rgb() values (this file is allow-listed by scripts/check-tokens.mjs for that reason).
 */
import { cellWidth, textCells } from './cell-width'
import { PAINTED, Painter, isPainted } from './paint'

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
// - an emoji, as the reader sees it (one grapheme: 👍🏽 with its skin tone, 👨‍👩‍👧 joined, 🇺🇸, ❤️ with its
//   emoji selector), is one box exactly the cells tmux counts for it, drawn in full: its glyph is not
//   clipped (a colour emoji is taller than a row, and ❤️ counts one cell though it is drawn two wide, so
//   it may reach into the next cell, the columns after it staying where tmux has them), and scaled down
//   only when wider than two cells (`term-emoji`, `--emoji-scale` measured by the terminal view);
// - another wide character (a symbol) is boxed in its two cells, a glyph of its own font;
// - a run of box drawing and blocks (U+2500–259F: rules, frames, a table's borders) is boxed in its cells,
//   its text transparent (`term-painted`): the row's painted layer draws it (`paint.ts`), so a │ meets the
//   one in the row above and below, and selecting or copying still gives the characters;
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

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** A run of non-ASCII → HTML: its emoji (whole graphemes) drawn apart, the rest by `textHtml`. */
function cellsHtml(run: string): string {
  if (!EMOJI.test(run)) return textHtml(run)
  let html = ''
  let rest = ''
  for (const { segment } of graphemes.segment(run)) {
    if (!EMOJI.test(segment)) {
      rest += segment
      continue
    }
    if (rest) html += textHtml(rest)
    rest = ''
    html += `<span class="inline-block align-top" style="width:${textCells(segment)}ch"><span class="term-emoji">${escapeHtml(segment)}</span></span>`
  }
  return rest ? html + textHtml(rest) : html
}

function textHtml(run: string): string {
  let html = ''
  let narrow = ''
  let lines = '' // box drawing, stretched to the row
  let cjk = ''
  const flush = () => {
    if (narrow) html += box(narrow, textCells(narrow))
    if (lines) html += box(lines, textCells(lines), ' term-painted')
    if (cjk) html += `<span class="term-wide">${escapeHtml(cjk)}</span>`
    narrow = ''
    lines = ''
    cjk = ''
  }
  for (const char of run) {
    const code = char.codePointAt(0)!
    if (cellWidth(code) !== 2 && isPainted(code)) {
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

/** The colours a run is drawn in: its text's, and its background's (none: the terminal's own). */
function colours(s: Style): { fg?: string; bg?: string } {
  return {
    fg: s.inverse ? (s.bg ?? 'var(--color-terminal-bg)') : s.fg,
    bg: s.inverse ? (s.fg ?? 'var(--color-terminal-fg)') : s.bg,
  }
}

function wrap(text: string, s: Style, html = gridHtml(text)): string {
  const { fg } = colours(s)
  const classes = [
    s.bold && 'font-semibold',
    s.dim && 'opacity-60',
    s.italic && 'italic',
    s.underline && 'underline',
    s.strike && 'line-through',
  ]
    .filter(Boolean)
    .join(' ')
  // Its background is painted (the row's SVG, `paint.ts`), edge to edge of its cells and its row.
  const css = fg ? `color:${fg}` : ''
  if (!classes && !css) return html
  return `<span${classes ? ` class="${classes}"` : ''}${css ? ` style="${css}"` : ''}>${html}</span>`
}

// SGR, any other CSI, OSC (BEL or ST terminated), newlines, plain text.
const TOKEN = /\x1b\[([0-9;:]*)m|\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b.?|\r|\n|[^\x1b\r\n]+/g

interface Run {
  text: string
  style: Style
}

/** A line's styled runs → HTML: each run as `gridHtml` draws it, so the line takes exactly its cells, and
 *  behind them the row's painted layer (`paint.ts`: backgrounds, box drawing, blocks), when it has any. */
export function lineHtml(runs: Run[]): string {
  const painter = new Painter()
  let html = ''
  let col = 0
  for (const r of runs) {
    const { fg, bg } = colours(r.style)
    const cells = textCells(r.text)
    if (bg) painter.background(col, cells, bg)
    if (PAINTED.test(r.text)) {
      let at = col
      for (const { segment } of graphemes.segment(r.text)) {
        const code = segment.codePointAt(0)!
        if (segment.length === String.fromCodePoint(code).length && isPainted(code))
          painter.glyph(at, code, fg ?? 'var(--color-terminal-fg)', bg ?? 'var(--color-terminal-bg)')
        at += textCells(segment)
      }
    }
    html += wrap(r.text, r.style)
    col += cells
  }
  return painter.svg(col) + html
}

/** One line's text → its HTML, and the style it leaves on for the next (SGR state runs across lines). */
function parseLine(raw: string, start: Style): { html: string; end: Style } {
  const line: Run[] = []
  let style = start
  for (const match of raw.matchAll(TOKEN)) {
    const token = match[0]
    if (match[1] !== undefined) {
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
  return { html: lineHtml(line), end: style }
}

// Lines already drawn, by the style they start in and their text: a screen mostly repeats the one before
// (output scrolling up a row, a status line changing), so each update parses and paints only what is new.
const CACHE_LINES = 8192
const drawn = new Map<string, { html: string; end: Style }>()

export function ansiToLines(text: string): string[] {
  const lines: string[] = []
  let style: Style = {}
  for (const raw of text.split('\n')) {
    const key = `${JSON.stringify(style)}\u0000${raw}`
    let line = drawn.get(key)
    if (!line) {
      line = parseLine(raw, style)
      drawn.set(key, line)
      if (drawn.size > CACHE_LINES) drawn.delete(drawn.keys().next().value!)
    }
    lines.push(line.html)
    style = line.end
  }
  return lines
}
