/**
 * The words Live mode acts on, told from what is said by the transcript: a segment that is only a command
 * (`commandIn`), or a long one ending in "send" (`trailingSend`). A command inside a sentence is text.
 */

export type Command = 'send' | 'pause' | 'resume' | 'clear' | 'undo'

const WORDS: Record<Command, string[]> = {
  send: ['发送', 'send', 'send it'],
  pause: ['暂停', 'pause'],
  resume: ['继续', 'resume'],
  clear: ['清空', 'clear'],
  undo: ['撤回上一句', '撤回', 'undo'],
}

// Fillers Whisper writes around a short command, and punctuation: not part of what was meant.
const FILLERS = /(?:^|\s)(?:嗯+|啊+|呃+|哦+|额+|um+|uh+|ah+|oh)(?=\s|$)|[嗯啊呃哦额]+/giu
const PUNCTUATION = /[\p{P}\p{S}]/gu

/** A transcript without punctuation, fillers or case, its spaces collapsed. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(PUNCTUATION, ' ').replace(FILLERS, ' ').replace(/\s+/g, ' ').trim()
}

/** The command a whole (short) segment is, or null: it must be nothing but the command. */
export function commandIn(text: string): Command | null {
  const said = normalize(text)
  for (const [command, words] of Object.entries(WORDS) as [Command, string[]][]) {
    if (words.includes(said)) return command
  }
  return null
}

/** A long segment that ends in "send" (发送): what comes before it, to append and then send; else null.
 *  Only send may trail a sentence. */
export function trailingSend(text: string): string | null {
  const trimmed = text.replace(/[\s\p{P}]+$/u, '')
  for (const word of ['发送', 'send']) {
    const tail = new RegExp(`(?:^|[\\s\\p{P}]|(?<=[^\\x00-\\x7F]))${word}$`, 'iu')
    if (word === 'send' && !tail.test(trimmed)) continue
    if (!trimmed.toLowerCase().endsWith(word)) continue
    // The word that joins it to the sentence goes with it ("…and send", "…然后发送").
    const rest = trimmed
      .slice(0, trimmed.length - word.length)
      .replace(/[\s,，、。]+$/u, '')
      .replace(/(?:\s+(?:and then|and|then)|然后|再|就)$/iu, '')
      .replace(/[\s,，、。]+$/u, '')
    return rest.trim() ? rest.trim() : null
  }
  return null
}
