/**
 * The words Live mode acts on, told from what is said by the transcript: a segment that is only a command
 * (`commandIn`), or a long one ending in "send" (`trailingSend`). A command inside a sentence is text.
 */

export type Command = 'send' | 'pause' | 'resume' | 'clear' | 'undo'

// Each command as Whisper writes it, and as it mishears a one-word clip (seen: 发送 as "Façam", send as
// "end", "then send"): near-misses in sound, matched only when that is all a short segment says.
const WORDS: Record<Command, string[]> = {
  send: [
    '发送',
    '发松',
    '罚送',
    '法送',
    '发宋',
    '发诵',
    '花送',
    'fa song',
    'fasong',
    'façam',
    'fassão',
    'send',
    'send it',
    'sent',
    'end',
    'sand',
    'sen',
  ],
  pause: ['暂停', '站停', '暂定', '战停', '赞停', 'zan ting', 'zanting', 'pause', 'paws', 'pose', 'pass'],
  resume: ['继续', '机续', '继序', 'ji xu', 'jixu', 'resume', 'continue'],
  clear: ['清空', '请空', '亲空', '清控', 'qing kong', 'qingkong', 'clear', 'clare', 'clea'],
  undo: ['撤回上一句', '撤回', '撤回上一个', '车回', 'che hui', 'undo', 'and do', 'undue'],
}
// A word Whisper puts before a lone command ("Then send.", "OK, pause"): not part of it.
const LEAD = /^(?:then|and|ok|okay|so|那|好|好的|那就)\s*/u

// Fillers Whisper writes around a short command, and punctuation: not part of what was meant.
const FILLERS = /(?:^|\s)(?:嗯+|啊+|呃+|哦+|额+|um+|uh+|ah+|oh)(?=\s|$)|[嗯啊呃哦额]+/giu
const PUNCTUATION = /[\p{P}\p{S}]/gu

/** A transcript without punctuation, fillers or case, its spaces collapsed. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(PUNCTUATION, ' ').replace(FILLERS, ' ').replace(/\s+/g, ' ').trim()
}

/** The command a whole (short) segment is, or null: it must be nothing but the command. */
export function commandIn(text: string): Command | null {
  const said = normalize(text).replace(LEAD, '').trim()
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
