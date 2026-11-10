import type { Command } from '../commands'

/**
 * A language Live mode takes spoken commands in: data only, one file per language. The code that hears
 * commands (`commands.ts`, `kws.ts`) and shows them (`components/live.tsx`) reads these and holds no words
 * of its own.
 */
export interface CommandPack {
  id: string
  /** The language's own name, as the settings list it. */
  name: string
  /** The word to say for each command, as hints show it. */
  say: Record<Command, string>
  /** What a transcript of a short segment that is only that command may read, lower-case, without
   *  punctuation: the word, and how speech to text mishears it (near-misses in sound). */
  heard: Record<Command, string[]>
  /** Words a transcript may put before a lone command ("then send"): not part of it. */
  leads: string[]
  /** Fillers a transcript may put around one (um, uh): dropped. */
  fillers: string[]
  /** How "send" may end a longer sentence, and the words that join it to the sentence ("…and send"). */
  trailingSend: string[]
  joiners: string[]
  /** Script without spaces between words: a trailing send needs no space before it. */
  unspaced?: boolean
  /** The keyword spotter's tokens for each command (the zh+en model's: ARPAbet phones for English,
   *  pinyin initials and toned finals for Chinese), and decoys: words close to "send" that are no command. */
  tokens: Partial<Record<Command, string[][]>>
  decoys: string[][]
}
