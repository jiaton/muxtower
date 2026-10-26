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
// width, so it gets exactly the cells tmux gives it (see cell-width.ts): each wide character its own
// two-cell box, centered like a terminal draws it, and each run of other non-ASCII one box its width.
// The boxes clip: a glyph drawn wider than its cells (a phone's fallback font, a rule of ─ across the
// whole pane) would otherwise widen the view past the pane and let it scroll sideways. Aligned to the
// top, since a clipping inline box sits on its bottom edge instead of the text's baseline.
const NON_ASCII = /[^\x00-\x7f]+/g

function cellsHtml(run: string): string {
  let html = ''
  let narrow = ''
  const flush = () => {
    if (narrow) html += `<span class="inline-block overflow-hidden align-top" style="width:${textCells(narrow)}ch">${escapeHtml(narrow)}</span>`
    narrow = ''
  }
  for (const char of run) {
    if (cellWidth(char.codePointAt(0)!) === 2) {
      flush()
      html += `<span class="inline-block w-[2ch] overflow-hidden text-center align-top">${escapeHtml(char)}</span>`
    } else narrow += char
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

function wrap(text: string, s: Style): string {
  const html = gridHtml(text)
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

export function ansiToLines(text: string): string[] {
  const lines: string[] = []
  let line = ''
  let style: Style = {}
  for (const match of text.matchAll(TOKEN)) {
    const token = match[0]
    if (token === '\n') {
      lines.push(line)
      line = ''
    } else if (match[1] !== undefined) {
      style = applySgr(
        style,
        match[1]
          .split(/[;:]/)
          .filter((x) => x !== '')
          .map(Number),
      )
    } else if (token[0] !== '\x1b' && token !== '\r') {
      line += wrap(token, style)
    }
  }
  lines.push(line)
  return lines
}
