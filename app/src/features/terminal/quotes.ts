/** Quoting what the agent wrote in a reply (select it, Reply), as in the Claude apps: quotes wait above
 *  the message box, apart from what is typed, and go first in the message, as Markdown quotes. */

const MAX_LINES = 12
const MAX_CHARS = 1200
// What a terminal draws around and inside its boxes: not part of what was said.
const FRAME = /^[\s│┃║|╭╮╰╯┌┐└┘├┤─━═]+|[\s│┃║|╭╮╰╯┌┐└┘├┤─━═]+$/g

/** A selection as a quote: each line without a terminal's frame around it, runs of blank lines as one,
 *  and a long one cut short (`…`). Empty when nothing is left. */
export function quoteOf(selected: string): string {
  const lines = selected
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(FRAME, ''))
    .filter((line, i, all) => line || (i > 0 && all[i - 1]))
  while (lines.length && !lines.at(-1)) lines.pop()
  let quote = lines.slice(0, MAX_LINES).join('\n')
  if (quote.length > MAX_CHARS) quote = quote.slice(0, MAX_CHARS).trimEnd()
  return quote && (lines.length > MAX_LINES || quote.length < lines.join('\n').length) ? `${quote} …` : quote
}

/** The message to send: the quotes, each as a Markdown quote, then what was typed. */
export function withQuotes(quotes: string[], text: string): string {
  const quoted = quotes.map((q) =>
    q
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n'),
  )
  return [...quoted, text.trim()].filter(Boolean).join('\n\n')
}
