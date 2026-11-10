import { enabledPacks, type CommandPack } from './packs'

/**
 * The words Live mode acts on, told from what is said by the transcript, in the languages chosen (their
 * packs, `packs/`): a segment that is only a command (`commandIn`), or a long one ending in "send"
 * (`trailingSend`). A command inside a sentence is text.
 */

export type Command = 'send' | 'pause' | 'resume' | 'clear' | 'undo'

const PUNCTUATION = /[\p{P}\p{S}]/gu
const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const anyOf = (words: string[]) => words.map(escape).join('|')

/** A transcript without punctuation, fillers or case, its spaces collapsed. */
export function normalize(text: string, packs: CommandPack[] = enabledPacks()): string {
  const fillers = packs.flatMap((p) => p.fillers)
  const spaced = new RegExp(`(?:^|\\s)(?:${anyOf(fillers)})+(?=\\s|$)`, 'giu')
  const bare = packs.filter((p) => p.unspaced).flatMap((p) => p.fillers)
  let said = text.toLowerCase().replace(PUNCTUATION, ' ')
  if (fillers.length) said = said.replace(spaced, ' ')
  if (bare.length) said = said.replace(new RegExp(`(?:${anyOf(bare)})+`, 'gu'), ' ') // between words, unspaced
  return said.replace(/\s+/g, ' ').trim()
}

/** The command a whole (short) segment is, or null: it must be nothing but the command (a lead word aside). */
export function commandIn(text: string, packs: CommandPack[] = enabledPacks()): Command | null {
  const leads = packs.flatMap((p) => p.leads)
  const lead = leads.length ? new RegExp(`^(?:${anyOf(leads)})\\s*`, 'u') : null
  const said = (lead ? normalize(text, packs).replace(lead, '') : normalize(text, packs)).trim()
  for (const pack of packs) {
    for (const [command, forms] of Object.entries(pack.heard) as [Command, string[]][]) {
      if (forms.includes(said)) return command
    }
  }
  return null
}

/** A long segment that ends in "send": what comes before it (and the word joining them), to append and
 *  then send; else null. Only send may trail a sentence. */
export function trailingSend(text: string, packs: CommandPack[] = enabledPacks()): string | null {
  const trimmed = text.replace(/[\s\p{P}]+$/u, '')
  for (const pack of packs) {
    for (const word of pack.trailingSend) {
      if (!trimmed.toLowerCase().endsWith(word.toLowerCase())) continue
      const before = trimmed.slice(0, trimmed.length - word.length)
      if (!pack.unspaced && before && !/[\s\p{P}]$/u.test(before)) continue // "resend": not the word
      const joiners = pack.unspaced ? anyOf(pack.joiners) : `\\s+(?:${anyOf(pack.joiners)})`
      const rest = before
        .replace(/[\s\p{P}]+$/u, '')
        .replace(new RegExp(`(?:${joiners})$`, 'iu'), '')
        .replace(/[\s\p{P}]+$/u, '')
        .trim()
      return rest || null
    }
  }
  return null
}
