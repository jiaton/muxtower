import type { Command } from './commands'

/**
 * Live mode's spoken commands, heard on the device: a keyword spotter (sherpa-onnx KWS, `kws.worker.ts`)
 * runs on each short segment, so a command needs no upload, and while paused "resume" is heard without
 * anything leaving the device.
 *
 * One model knows both languages (zh+en, 3M parameters, Apache-2.0): it is downloaded once, from a pinned
 * commit, the first time Live starts, and kept in the browser's Cache Storage; it is read from there each
 * time after (downloaded again, quietly, if the browser dropped it). The languages chosen (per browser:
 * English by default) decide which words it listens for. Loaded only while Live is on; turning Live off
 * terminates its Worker, which frees all of it.
 */

export type Language = 'en' | 'zh'

const COMMIT = '1770a4b22db32184c110ac43c601db17cc9c93f8'
const BASE = `https://huggingface.co/moeru-ai/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20/resolve/${COMMIT}/install/bin/wasm`
export const PACK = {
  name: 'Voice commands (Chinese and English)',
  data: `${BASE}/preload.data`,
  metadata: `${BASE}/preload.js.metadata`,
  bytes: 13_076_183,
}
const CACHE = 'muxtower-kws-v1' // the URLs are versioned (a commit): a new pack is a new URL, not a new cache

// Each command as the model's tokens: ARPAbet phones for English, pinyin initials and toned finals for Chinese.
type Words = Partial<Record<Command, string[][]>>
const WORDS: Record<Language, Words> = {
  en: {
    send: [['S', 'EH1', 'N', 'D']],
    pause: [['P', 'AO1', 'Z']],
    resume: [
      ['R', 'IH0', 'Z', 'UW1', 'M'],
      ['R', 'IY0', 'Z', 'UW1', 'M'],
    ],
    clear: [['K', 'L', 'IH1', 'R']],
    undo: [
      ['AH0', 'N', 'D', 'UW1'],
      ['AH1', 'N', 'D', 'UW1'],
    ],
  },
  zh: {
    send: [['f', 'ā', 's', 'òng']],
    pause: [['z', 'àn', 't', 'íng']],
    resume: [['j', 'ì', 'x', 'ù']],
    clear: [['q', 'īng', 'k', 'ōng']],
    undo: [['ch', 'è', 'h', 'uí', 'sh', 'àng', 'y', 'í', 'j', 'ù']],
  },
}
// Words close to "send" (a false send is the costliest mistake): heard as one of these, it is no command.
const DECOYS: Record<Language, string[][]> = {
  en: [
    ['S', 'P', 'EH1', 'N', 'D'],
    ['S', 'AE1', 'N', 'D'],
    ['S', 'EH1', 'N', 'T'],
    ['S', 'P', 'EH1', 'N', 'T'],
    ['EH1', 'N', 'D'],
  ],
  zh: [
    ['f', 'ā', 's', 'ōng'],
    ['f', 'ā', 'sh', 'āo'],
  ],
}
const SEND_THRESHOLD = 0.35 // stricter than the others' 0.25: sending by mistake is worse than missing it
const DECOY = '~'

export function keywordsFor(languages: Language[]) {
  const entries: { label: string; threshold?: number; matches: { tokens: string[] }[] }[] = []
  for (const language of languages) {
    for (const [command, sounds] of Object.entries(WORDS[language]) as [Command, string[][]][]) {
      entries.push({
        label: `${command}:${language}`,
        threshold: command === 'send' ? SEND_THRESHOLD : undefined,
        matches: sounds.map((tokens) => ({ tokens })),
      })
    }
    DECOYS[language].forEach((tokens, i) => entries.push({ label: `${DECOY}${language}${i}`, matches: [{ tokens }] }))
  }
  return entries
}

/** The command a spotter's labels make, or null (none, or a decoy among them: not sure). */
export function commandOf(labels: string[]): Command | null {
  if (!labels.length || labels.some((l) => l.startsWith(DECOY))) return null
  const commands = new Set(labels.map((l) => l.split(':')[0] as Command))
  return commands.size === 1 ? [...commands][0]! : null
}

// --- the languages chosen, per browser ------------------------------------------------------------------

const LANGUAGES_KEY = 'muxtower.live.languages'

export function chosenLanguages(): Language[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LANGUAGES_KEY) ?? 'null') as Language[] | null
    const valid = saved?.filter((l) => l === 'en' || l === 'zh') ?? []
    return valid.length ? valid : ['en']
  } catch {
    return ['en']
  }
}

export function chooseLanguages(languages: Language[]) {
  try {
    localStorage.setItem(LANGUAGES_KEY, JSON.stringify(languages.length ? languages : ['en']))
  } catch {
    // storage blocked: English, as by default
  }
}

// --- the pack: downloaded once, kept in Cache Storage ----------------------------------------------------

const caching = () => (typeof caches === 'undefined' ? null : caches.open(CACHE))

export async function packDownloaded(): Promise<boolean> {
  try {
    const cache = await caching()
    return !!(cache && (await cache.match(PACK.data)) && (await cache.match(PACK.metadata)))
  } catch {
    return false
  }
}

export async function removePack() {
  try {
    await caches.delete(CACHE)
  } catch {
    // nothing kept, or storage blocked
  }
}

/** The pack's bytes and file list: from the cache, else downloaded (`progress`: bytes so far) and kept. */
export async function loadPack(progress?: (received: number, total: number) => void) {
  const cache = await (caching() ?? Promise.resolve(null)).catch(() => null)
  const cached = async (url: string) => (cache ? await cache.match(url) : undefined)
  const fetched = async (url: string, report: boolean) => {
    const res = await fetch(url)
    if (!res.ok || !res.body) throw new Error(`could not download the voice commands (HTTP ${res.status})`)
    const total = Number(res.headers.get('content-length')) || PACK.bytes
    const chunks: Uint8Array[] = []
    let received = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (report) progress?.(received, total)
    }
    const body = new Blob(chunks as BlobPart[])
    await cache?.put(url, new Response(body, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => undefined)
    return new Response(body)
  }
  const [data, metadata] = await Promise.all([
    cached(PACK.data).then((r) => r ?? fetched(PACK.data, true)),
    cached(PACK.metadata).then((r) => r ?? fetched(PACK.metadata, false)),
  ])
  return { data: await data.arrayBuffer(), metadata: await metadata.json() }
}

// --- the spotter, while Live is on ------------------------------------------------------------------------

export interface Spotter {
  /** The command a short segment (16 kHz mono) is, if the spotter is sure; else null. */
  spot: (samples: Float32Array) => Promise<Command | null>
  dispose: () => void
}

export async function startSpotter(languages: Language[], progress?: (received: number, total: number) => void): Promise<Spotter> {
  const pack = await loadPack(progress)
  const worker = new Worker(new URL('./kws.worker.ts', import.meta.url), { type: 'module' })
  const waiting = new Map<number, (labels: string[] | null) => void>()
  let next = 0
  await new Promise<void>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ kind: string; id?: number; labels?: string[]; message?: string }>) => {
      const msg = e.data
      if (msg.kind === 'ready') resolve()
      else if (msg.kind === 'spot' && msg.id !== undefined) waiting.get(msg.id)?.(msg.labels ?? [])
      else if (msg.kind === 'error') {
        if (msg.id === undefined) reject(new Error(msg.message))
        else waiting.get(msg.id)?.(null)
      }
      if (msg.id !== undefined) waiting.delete(msg.id)
    }
    worker.onerror = (e) => reject(new Error(e.message || 'the voice commands could not start'))
    worker.postMessage({ kind: 'init', data: pack.data, metadata: pack.metadata, keywords: keywordsFor(languages) }, [pack.data])
  })
  return {
    spot: (samples) =>
      new Promise((resolve) => {
        const id = next++
        waiting.set(id, (labels) => resolve(labels ? commandOf(labels) : null))
        worker.postMessage({ kind: 'spot', id, samples, rate: 16000 })
      }),
    dispose: () => {
      worker.terminate() // the module, its memory and the model go with it
      for (const done of waiting.values()) done(null)
      waiting.clear()
    },
  }
}
