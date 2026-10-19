/** A screen is three parts — header, body lines, footer — drawn into the one full-screen text container.
 *  `compose` is the only place text becomes the container's content, so every limit is applied here. */
import { BODY_LINES, MAX_TEXT_BYTES, TEXT_WIDTH } from './limits'
import { fit, glyphs, utf8Bytes } from './text'

export interface Screen {
  header: string
  /** Already laid out: one entry per display line (use `wrap` / `columns`). At most BODY_LINES. */
  body: string[]
  footer: string
}

export function compose(screen: Screen): string {
  // Lines arrive laid out (columns are padded with spaces), so spacing is kept; only glyphs are fixed.
  const line = (text: string) => fit(glyphs(text).trimEnd(), TEXT_WIDTH)
  const header = line(screen.header)
  const footer = line(screen.footer)
  const body = screen.body.slice(0, BODY_LINES).map(line)
  while (body.length < BODY_LINES) body.push('')
  // Over the byte budget (long Chinese lines are 3 bytes a character): shorten the body from the end.
  const join = () => [header, ...body, footer].join('\n')
  for (let i = body.length - 1; utf8Bytes(join()) > MAX_TEXT_BYTES && i >= 0; i--) {
    const room = MAX_TEXT_BYTES - (utf8Bytes(join()) - utf8Bytes(body[i]))
    body[i] = room > 3 ? cutBytes(body[i], room - 3) + '…' : ''
  }
  return join()
}

function cutBytes(text: string, bytes: number): string {
  let out = ''
  for (const char of text) {
    if (utf8Bytes(out + char) > bytes) break
    out += char
  }
  return out
}
