import type { components } from '@/lib/api/schema'
import type { World } from './world'

type Spoken = components['schemas']['Spoken']

/**
 * Play in the demo: a made-up spoken summary per session, as the hub would make it (`POST
 * /v1/sessions/{id}/spoken`), kept per reply so a second press is the same one. No summarizer and no hub
 * voice here: the browser says it with its own voice.
 */
/** Made-up summaries of the scenes' replies, by how each reply starts. */
const SAID: [string, string][] = [
  ['All 42 payment tests pass', 'The payment tests all pass. A charge now retries three times, and is never taken twice.'],
  ['The billing page now shows daily usage', "The billing page shows the last 30 days of usage now, with the plan's limit drawn in."],
  ['Wrote docs/getting-started.md', 'The getting started guide is written: install, first run, and the three main commands.'],
  ['Plan is clean', 'The Terraform plan adds three things and changes nothing. It waits for you to apply it.'],
  ['Release notes for 2.4', 'The 2.4 release notes are ready to read.'],
  ['Thanks, review.', 'Review passed. Nothing merges in the demo; for real, PR 233 would merge now.'],
]

/** A short summary of what a session without one of its own said last: its first sentence. */
function firstSentence(reply: string): string {
  const flat = reply
    .replace(/[`*#>_]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const sentence = flat.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? flat
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence
}

const KEPT = new WeakMap<World, Map<string, Spoken>>()

/** The summaries kept this visit: per session, of its latest reply. */
const keptOf = (world: World) => {
  let kept = KEPT.get(world)
  if (!kept) KEPT.set(world, (kept = new Map()))
  return kept
}

/** The spoken summary of the session's latest reply: the one kept for it, else made now. Null without one. */
export function speakLatest(world: World, id: string): Spoken | null {
  const reply = world.session(id)?.last_message
  if (!reply) return null
  const kept = keptOf(world)
  const before = kept.get(id)
  if (before && before.reply === reply) return before
  const made: Spoken = {
    at: new Date().toISOString(),
    text: SAID.find(([start]) => reply.startsWith(start))?.[1] ?? firstSentence(reply),
    reply,
    reply_hash: `demo-${kept.size + 1}`,
    language: 'en',
  }
  kept.set(id, made)
  return made
}

/** What `GET /v1/sessions/{id}/spoken` answers: the one kept, if any. */
export function keptSpoken(world: World, id: string): Spoken[] {
  const kept = keptOf(world).get(id)
  return kept ? [kept] : []
}
