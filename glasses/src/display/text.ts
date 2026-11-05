/** Text measured with the firmware font's own metrics (`@evenrealities/pretext`), so lines are cut and
 *  columns aligned to the pixel, Chinese included. */
import { getAdvW, getTextWidth } from '@evenrealities/pretext'

const ELLIPSIS = '…'
/** Stand-ins for symbols the firmware font lacks (it would drop them silently). */
const STAND_INS: Record<string, string> = { '✓': 'ok', '✔': 'ok', '✗': 'x', '✘': 'x', '▸': '>', '►': '>', '⏎': '' }

export const width = (text: string) => getTextWidth(text)

const missing = (char: string) => {
  const code = char.codePointAt(0) ?? 0
  return code > 0x20 && getAdvW(code) === 0
}

/** Unsupported glyphs replaced or removed, line breaks and tabs turned into spaces; spacing kept. */
export function glyphs(text: string): string {
  let out = ''
  for (const char of text.replace(/[\n\r\t]/g, ' ')) {
    if (char in STAND_INS) out += STAND_INS[char]
    else if (!missing(char)) out += char
  }
  return out
}

/** One line of display text from free text: `glyphs`, with runs of whitespace collapsed. */
export const clean = (text: string) => glyphs(text.replace(/\s+/g, ' ')).trim()

/** Cuts `text` to `px`, ending in an ellipsis when it had to cut. */
export function fit(text: string, px: number): string {
  if (width(text) <= px) return text
  const chars = [...text]
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (width(chars.slice(0, mid).join('') + ELLIPSIS) <= px) lo = mid
    else hi = mid - 1
  }
  return chars.slice(0, lo).join('').trimEnd() + ELLIPSIS
}

/** The firmware font's two blank glyphs: a space and the ideographic space. Their widths share no factor
 *  (5 and 21 px), so mixing them reaches almost any gap within a pixel or two, where spaces alone land within 5. */
const SPACE = ' '
const WIDE_SPACE = '\u3000'

/** `text` followed by the blank run that brings it closest to `px` (fewest wide spaces on a tie),
 *  measured as a whole so kerning against the blanks counts. */
function padded(text: string, px: number): string {
  const space = width(SPACE)
  const wide = width(WIDE_SPACE)
  const missingPx = px - width(text)
  let best = text
  let bestMiss = Math.abs(missingPx)
  for (let wides = 0; wides * wide <= missingPx + wide; wides++) {
    const spaces = Math.max(0, Math.round((missingPx - wides * wide) / space))
    for (const n of [spaces - 1, spaces, spaces + 1]) {
      if (n < 0) continue
      const candidate = text + WIDE_SPACE.repeat(wides) + SPACE.repeat(n)
      const miss = Math.abs(px - width(candidate))
      if (miss < bestMiss) [best, bestMiss] = [candidate, miss]
    }
  }
  return best
}

/** Pads with blanks to `px` (within a pixel or two where the gap allows, within a space otherwise). */
export function pad(text: string, px: number): string {
  return px - width(text) <= 0 ? text : padded(text, px)
}

/** Lays cells out as columns of the given pixel widths; the last cell takes what is left of `total`.
 *  Each column starts at its own stop from the left edge, so rounding never adds up along a line. */
export function columns(cells: string[], widths: number[], total: number): string {
  let line = ''
  let stop = 0
  cells.forEach((cell, i) => {
    const last = i === cells.length - 1
    const start = width(line)
    stop = last ? total : stop + widths[i]
    const text = fit(clean(cell), stop - start - (last ? 0 : width(SPACE)))
    line = last ? line + text : pad(line + text, stop)
  })
  return line
}

const CJK_RANGES = '⺀-鿿가-힯豈-﫿＀-￯'
/** A CJK character, a run of anything else that is not a space, or a run of spaces. */
const TOKEN = new RegExp(`[${CJK_RANGES}]|[^\\s${CJK_RANGES}]+|\\s+`, 'g')

/** Breaks paragraphs into lines of at most `px`: at spaces for Latin, between any two CJK characters,
 *  and anywhere inside a word too long for a line. */
export function wrap(text: string, px: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n+/)) {
    let line = ''
    for (const token of clean(paragraph).match(TOKEN) ?? []) {
      if (/^\s+$/.test(token)) {
        if (line) line += ' '
      } else if (width(line + token) <= px) {
        line += token
      } else {
        if (line.trim()) lines.push(line.trimEnd())
        line = ''
        for (const char of token) {
          if (line && width(line + char) > px) {
            lines.push(line)
            line = ''
          }
          line += char
        }
      }
    }
    if (line.trim()) lines.push(line.trimEnd())
  }
  return lines
}

export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length
