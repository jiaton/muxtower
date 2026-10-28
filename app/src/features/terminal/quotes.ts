/** Quoting what the agent wrote in a reply (select it, Reply), as in the Claude apps: quotes wait above
 *  the message box, apart from what is typed, each with a reply of its own if the owner writes one, and
 *  go first in the message, as Markdown quotes, each followed by its reply. */

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

/** A part of what the agent wrote, quoted, and what the owner replies to that part alone (may be empty). */
export interface Quote {
  text: string
  reply: string
}

/** The message to send: each quote as a Markdown quote followed by its own reply, then what was typed. */
export function withQuotes(quotes: Quote[], text: string): string {
  const quoted = quotes.map(({ text: quote, reply }) =>
    [
      quote
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n'),
      reply.trim(),
    ]
      .filter(Boolean)
      .join('\n\n'),
  )
  return [...quoted, text.trim()].filter(Boolean).join('\n\n')
}
