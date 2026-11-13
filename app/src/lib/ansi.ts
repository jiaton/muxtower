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
// width, so it gets exactly the cells tmux gives it (see cell-width.ts): each run of non-ASCII one box its
// width. The boxes clip: a glyph drawn wider than its cells (a phone's fallback font, a rule of ─ across the
// whole pane) would otherwise widen the view past the pane and let it scroll sideways. Aligned to the top,
// since a clipping inline box sits on its bottom edge instead of the text's baseline.
//
// Wide characters (CJK) are drawn by a line's segments instead (`lineHtml`): two cells of the monospace font
// are wider than a CJK glyph (1.2em against 1em), so a box per character spaced Chinese out, and a box per
// run left a gap before whatever followed it. Columns matter only where a line has them: at its rules and
// frames (box drawing) and at its gaps of two spaces or more (a table, a list in columns). Between those, a
// segment with wide characters is drawn tight in one box exactly its cells wide: what it leaves over falls
// just before the next rule or gap, or at the line's end, where it is not seen, and the columns stay.
const NON_ASCII = /[^\x00-\x7f]+/g

function cellsHtml(run: string): string {
  let html = ''
  let narrow = ''
  let wide = ''
  const flush = () => {
    if (narrow)
      html += `<span class="inline-block overflow-hidden align-top" style="width:${textCells(narrow)}ch">${escapeHtml(narrow)}</span>`
    if (wide)
      html += `<span class="inline-block overflow-hidden align-top" style="width:${[...wide].length * 2}ch">${escapeHtml(wide)}</span>`
    narrow = ''
    wide = ''
  }
  for (const char of run) {
    const isWide = cellWidth(char.codePointAt(0)!) === 2
    if ((isWide && narrow) || (!isWide && wide)) flush()
    if (isWide) wide += char
    else narrow += char
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
  const css = [fg && `color:${fg}`, bg && `background-color:${bg}`].filter(Boolean).join(';')
  if (!classes && !css) return html
  return `<span${classes ? ` class="${classes}"` : ''}${css ? ` style="${css}"` : ''}>${html}</span>`
}

// SGR, any other CSI, OSC (BEL or ST terminated), newlines, plain text.
const TOKEN = /\x1b\[([0-9;:]*)m|\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b.?|\r|\n|[^\x1b\r\n]+/g

interface Run {
  text: string
  style: Style
}

// Where a line's columns are: box drawing and blocks (rules, frames, a table's borders), and gaps of two
// spaces or more.
const ANCHOR = /[\u2500-\u259f]+| {2,}/g
const hasWide = (text: string) => [...text].some((c) => cellWidth(c.codePointAt(0)!) === 2)

/** A segment's runs (it may change color midway), drawn as they come, in one box `cells` wide. */
function tightHtml(runs: Run[], cells: number): string {
  const inner = runs.map((r) => wrap(r.text, r.style, escapeHtml(r.text))).join('')
  const last = runs.at(-1)?.style
  const bg = last ? (last.inverse ? (last.fg ?? 'var(--color-terminal-fg)') : last.bg) : undefined
  return `<span class="inline-block overflow-hidden align-top" style="width:${cells}ch${bg ? `;background-color:${bg}` : ''}">${inner}</span>`
}

/** A line's styled runs → HTML: each segment between its anchors with wide characters drawn tight in a box
 *  its cells wide; everything else as `gridHtml` draws it. */
export function lineHtml(runs: Run[]): string {
  const text = runs.map((r) => r.text).join('')
  if (!hasWide(text)) return runs.map((r) => wrap(r.text, r.style)).join('')
  // The runs' pieces between cuts (anchors' starts and ends), each still with its style.
  const cuts = new Set([0, text.length])
  for (const m of text.matchAll(ANCHOR)) cuts.add(m.index).add(m.index + m[0].length)
  const bounds = [...cuts].sort((a, b) => a - b)
  const piecesOf = (from: number, to: number): Run[] => {
    const out: Run[] = []
    let at = 0
    for (const run of runs) {
      const start = Math.max(from, at)
      const end = Math.min(to, at + run.text.length)
      if (start < end) out.push({ text: run.text.slice(start - at, end - at), style: run.style })
      at += run.text.length
    }
    return out
  }
  let html = ''
  for (let k = 0; k + 1 < bounds.length; k++) {
    const segment = text.slice(bounds[k], bounds[k + 1])
    const pieces = piecesOf(bounds[k], bounds[k + 1])
    html += hasWide(segment) ? tightHtml(pieces, textCells(segment)) : pieces.map((r) => wrap(r.text, r.style)).join('')
  }
  return html
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
