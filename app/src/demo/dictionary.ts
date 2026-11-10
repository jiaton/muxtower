import type { components } from '@/lib/api/schema'

type Dictionary = components['schemas']['Dictionary']
type DictionaryView = components['schemas']['DictionaryView']
type Correction = components['schemas']['Correction']

const BUDGET = 224 // what Whisper reads of a prompt, in its tokens
const BASE = 60 // the built-in prompt's share of it, about
const LEAD = 'Words: '

/** The daemon's estimate of Whisper's tokens (daemon asr/dictionary.py `tokens`), without CJK. */
function tokens(text: string): number {
  return (text.match(/[^\W\d_]+|\d+|[^\s\w]/gu) ?? []).reduce((n, piece) => n + (/^\w/u.test(piece) ? Math.ceil(piece.length / 4) : 1), 0)
}

/** The demo hub's voice dictionary: made-up words and corrections, changed by the page for the visit. */
let words: string[] = ['acme-cli', 'Zorbit', 'quuxdb', 'shop-api', 'idempotency']
let corrections: Correction[] = [
  { heard: 'zorbit', write: 'Zorbit' },
  { heard: '.acme', write: 'acme-cli' },
  { heard: 'mux tower', write: 'muxtower' },
]

/** It as the hub answers: with how many of its words fit in the prompt, first ones first. */
export function dictionary(): DictionaryView {
  let held = 0
  while (held < words.length && BASE + tokens(LEAD + words.slice(0, held + 1).join(', ') + '.') <= BUDGET) held++
  const used = BASE + (held ? tokens(LEAD + words.slice(0, held).join(', ') + '.') : 0)
  return { words, corrections, fit: { words_in_prompt: held, words: words.length, tokens: used, budget: BUDGET } }
}

export function saveDictionary(body: Partial<Dictionary>): DictionaryView {
  words = (body.words ?? []).filter((w) => typeof w === 'string' && w.trim()).slice(0, 200)
  corrections = (body.corrections ?? []).filter((c) => c?.heard?.trim() && c.write?.trim()).slice(0, 200)
  return dictionary()
}
