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

/** Pads with spaces to (about) `px`; the font is proportional, so this is exact to one space. */
export function pad(text: string, px: number): string {
  const space = width(' ')
  const missingPx = px - width(text)
  return missingPx <= 0 ? text : text + ' '.repeat(Math.round(missingPx / space))
}

/** Lays cells out as columns of the given pixel widths; the last cell takes what is left of `total`. */
export function columns(cells: string[], widths: number[], total: number): string {
  let line = ''
  let used = 0
  cells.forEach((cell, i) => {
    const last = i === cells.length - 1
    const room = last ? total - used : widths[i]
    const text = fit(clean(cell), room - (last ? 0 : width(' ')))
    line += last ? text : pad(text, room)
    used = width(line)
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
