import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mergeWithDefaults } from '@/lib/persist-merge'
import { afterOwnAudio, showSaying } from './media'
import { errorFields, logMedia } from './media-log'
import { languageOf, spokenIn } from './packs'

/**
 * Live's Read aloud: a listened session's turns said in a few words when they end (the daemon's spoken
 * summaries, `listen/`), its full reply on asking, in the hub's voice or the browser's own, in the language
 * of what is said (its own words, such as "a block of code", from its language's pack). Long text goes in pieces (a browser stops a long utterance). While it speaks, Live writes nothing:
 * it hears nothing at all, nor for a moment after (`TAIL_MS`), and drops anything it heard that overlapped
 * that time (`pipeline.ts`, `engine.ts`): "stop" is the button then; the spoken commands work once it is done.
 */

const PIECE = 180 // characters an utterance holds at most
/** After speaking, how long Live still hears nothing: the last of it echoing in the room or the car. */
export const TAIL_MS = 600

// When it spoke (ms since the epoch): each window from its start to its end plus the tail; the one still
// speaking ends at Infinity. Live hears nothing in them, and drops what it heard overlapping them.
const windows: { from: number; to: number }[] = []
const now = () => Date.now()

/** Whether Live must hear nothing now: speaking, or just done (the tail). */
export function quiet(at = now()): boolean {
  return windows.some((w) => at >= w.from && at < w.to)
}

/** Whether what was heard from `from` to `to` overlapped speaking (or its tail), even partly. */
export function overlapsSpeech(from: number, to: number): boolean {
  return windows.some((w) => from < w.to && to > w.from)
}

function began() {
  const last = windows.at(-1)
  if (!last || last.to !== Infinity) windows.push({ from: now(), to: Infinity })
  if (windows.length > 20) windows.shift()
}

function ended() {
  const last = windows.at(-1)
  if (last && last.to === Infinity) last.to = now() + TAIL_MS
}
const CODE = /```[\s\S]*?```/g

export interface Said {
  /** Whose: the session (`entryKey`) it is about. */
  key: string
  text: string | null
  reply: string | null
  /** What it is in (a tag: zh, en, …): the voice and Read aloud's own words. */
  language?: string
}

/** Why nothing could be said, as the hub says it (`listen/service.py` Problem). */
export type Problem = 'unavailable' | 'limit' | 'failed'

export interface Front {
  key: string
  daemonId?: string
  sessionId?: string
  name?: string
  reply: string | null
}

export interface Caption {
  /** Whose: the session's name. */
  title: string
  kind: 'summary' | 'reply'
  pieces: string[]
  /** The piece being said. */
  at: number
  done: boolean
}

const CAPTION_MS = 4000 // the caption stays this long after the speaking ends (unless kept)

interface SpeechState {
  readAloud: boolean
  setReadAloud: (on: boolean) => void
  speaking: boolean
  last: Said | null
  /** Sessions (`entryKey`) with a summary that came while away (page hidden, another session in front):
   *  not said unasked later; Play shows it is new. */
  unheard: Record<string, true>
  /** The session in front: its key and ids, its name, and its latest reply (Live's bar says), for Play,
   *  Read all, the caption and the phone's media controls. */
  front: Front | null
  /** What is being said, shown as it is said (`ReadAloudCaption`): until a few seconds after, or kept. */
  caption: Caption | null
  /** The caption kept open (tapped). */
  captionKept: boolean
  /** The session (`entryKey`) whose summary Play is asking for, until it comes (or fails). */
  asking: string | null
  /** Said once in Live's bar: why it speaks as it does ("using the phone's voice"). */
  note: string | null
}

export const useSpeech = create<SpeechState>()(
  persist(
    (set) => ({
      readAloud: false,
      setReadAloud: (readAloud) => {
        if (!readAloud) stopSpeaking()
        set({ readAloud })
      },
      speaking: false,
      last: null,
      unheard: {},
      front: null,
      note: null,
      asking: null,
      caption: null,
      captionKept: false,
    }),
    { name: 'muxtower.read-aloud', version: 1, merge: mergeWithDefaults, partialize: (s) => ({ readAloud: s.readAloud }) },
  ),
)

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

/** What is said of a reply read whole: no code read out (named, in its language), nor markdown's marks. */
export function speakable(reply: string, language = languageOf(reply)): string {
  return reply
    .replace(CODE, ` ${spokenIn(language).code}. `)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[#*_>|]+/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Text in pieces a browser says whole: at the end of a sentence where it can, else at a comma, else cut. */
export function pieces(text: string, size = PIECE): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest.length > size) {
    const window = rest.slice(0, size)
    const at = Math.max(...['。', '！', '？', '. ', '! ', '? ', '\n'].map((m) => window.lastIndexOf(m)))
    const comma = Math.max(...['，', '；', ', ', '; '].map((m) => window.lastIndexOf(m)))
    const cut = at > size / 3 ? at + 1 : comma > size / 3 ? comma + 1 : size
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

/** The phone's own voice for a language (`voiceTag`, e.g. zh-CN): that exact one, else any of it. */
function voiceFor(tag: string): SpeechSynthesisVoice | null {
  const voices = synth()?.getVoices() ?? []
  const lang = tag.split('-')[0]!
  return voices.find((v) => v.lang === tag) ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null
}

let run = 0 // each new speech: the ones before it stop

/** Says the text (cutting off whatever was being said), in pieces. */
/** Where a piece's audio is made, when the hub has a voice (`hub-voice.ts`): its mp3, or a refusal (the
 *  phone's own voice says it then). None: the phone's voice. */
type HubVoice = (text: string, language: string) => Promise<Blob>
let hubVoice: HubVoice | null = null
export function setHubVoice(voice: HubVoice | null) {
  hubVoice = voice
}

let playing: HTMLAudioElement | null = null

/** The phone's media controls while the hub's voice plays (`media.ts`): what is said, by which session.
 *  Only for the hub's audio: the phone's own voice is no media the system shows. */
function showMedia(caption: Caption | null) {
  if (!caption) return showSaying(null)
  const first = caption.pieces[0] ?? ''
  // A short one whole; a longer one its first sentence (a car's dash shows some 30 characters).
  const sentence = first.length > 30 ? (first.match(/^.*?[。！？.!?]/)?.[0] ?? first.slice(0, 30)) : first
  showSaying({ title: sentence, artist: caption.title })
}

let captionTimer: ReturnType<typeof setTimeout> | undefined

function captionDone() {
  const caption = useSpeech.getState().caption
  if (!caption) return
  useSpeech.setState({ caption: { ...caption, done: true } })
  clearTimeout(captionTimer)
  captionTimer = setTimeout(() => {
    const { caption: now, captionKept } = useSpeech.getState()
    if (now?.done && !captionKept) useSpeech.setState({ caption: null })
  }, CAPTION_MS)
}

/** The caption put away (×, a swipe). */
export function dismissCaption() {
  clearTimeout(captionTimer)
  useSpeech.setState({ caption: null, captionKept: false })
}

/** The caption kept open, or let go again (a tap). */
export function keepCaption(kept: boolean) {
  useSpeech.setState({ captionKept: kept })
  if (!kept && useSpeech.getState().caption?.done) captionDone()
}

/** The one element the hub's voice plays through, every piece: a car's media UI (the Tesla's) follows one
 *  player, and one made new for each piece left it pointing at the last (a press mid-speech reached
 *  nothing). Made on first use, its source set per piece. */
let voiceElement: HTMLAudioElement | null = null
const voiceAudio = () => (voiceElement ??= new Audio())

/** Tests: the next piece makes the element again (each test has its own stand-in Audio). */
export function forgetVoiceElement() {
  voiceElement = null
}

function playAudio(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const audio = voiceAudio()
    audio.src = url
    playing = audio
    const started = performance.now()
    const at = () => ({ ms: performance.now() - started })
    const done = (ok: boolean) => () => {
      URL.revokeObjectURL(url)
      if (playing === audio) playing = null
      if (ok) resolve()
      else reject(new Error('could not play'))
    }
    // The media log: the hub's mp3 as it plays, pauses, ends or fails; Chrome may hand the buttons to it
    // and take them along when it ends, so the handlers are set again then.
    audio.onplay = () => logMedia('mp3', { ev: 'play', ...at() })
    audio.onpause = () => logMedia('mp3', { ev: 'pause', ...at() })
    // Everything else it does, too: what a press mid-speech does to it shows here (a car may pause or
    // reload the element itself instead of calling our handlers).
    for (const ev of ['playing', 'waiting', 'stalled', 'suspend', 'emptied', 'loadstart', 'seeking'] as const)
      audio[`on${ev}`] = () => logMedia('mp3', { ev, paused: audio.paused, ready: audio.readyState, ...at() })
    audio.onended = () => {
      logMedia('mp3', { ev: 'ended', ...at() })
      done(true)()
      afterOwnAudio('mp3 ended')
    }
    audio.onerror = () => {
      logMedia('mp3', { ev: 'error', code: audio.error?.code ?? null, ...at() })
      done(false)()
    }
    audio.play().catch((error: unknown) => {
      logMedia('mp3', { ev: 'play-rejected', ...errorFields(error), ...at() })
      done(false)()
    })
  })
}

let phoneVoice = false

/** Whether the phone's own voice (speechSynthesis) is speaking: it has no media element, so while it does
 *  only the hold's silent loop keeps this page the phone's media (`car-media.ts`). */
export function phoneVoiceSpeaking(): boolean {
  return phoneVoice
}

function phoneVoiceDone(ev: string, fields: Record<string, string> = {}) {
  if (!phoneVoice) return
  phoneVoice = false
  logMedia('local-voice', { ev, ...fields })
  afterOwnAudio('phone voice ended')
}

function sayLocally(piece: string, language: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = synth()
    if (!s) return reject(new Error('no voice'))
    const u = new SpeechSynthesisUtterance(piece)
    const tag = spokenIn(language).voiceTag
    const voice = voiceFor(tag)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? tag
    u.onend = () => {
      phoneVoiceDone('end')
      resolve()
    }
    u.onerror = (e) => {
      phoneVoiceDone('error', { error: (e as SpeechSynthesisErrorEvent | undefined)?.error ?? 'unknown' })
      reject(new Error('could not say'))
    }
    phoneVoice = true
    logMedia('local-voice', { ev: 'start' })
    s.speak(u)
  })
}

/** Says the text (cutting off whatever was being said), in pieces: in the hub's voice when it has one, the
 *  next piece fetched while one plays; in the phone's own voice when it has none, or does not answer (said
 *  once: "using the phone's voice"). */
export function speak(text: string, about: { title?: string; kind?: Caption['kind']; language?: string } = {}) {
  if (!text.trim() || (!hubVoice && !synth())) return
  synth()?.cancel()
  playing?.pause()
  const mine = ++run
  const queue = pieces(text)
  const language = about.language ?? languageOf(text)
  began()
  clearTimeout(captionTimer)
  const caption: Caption = { title: about.title ?? '', kind: about.kind ?? 'summary', pieces: queue, at: 0, done: false }
  useSpeech.setState({ speaking: true, caption })
  const fetchOf = (piece: string | undefined) => (piece && hubVoice ? hubVoice(piece, language).catch(() => null) : Promise.resolve(null))
  void (async () => {
    let next = fetchOf(queue[0])
    let local = !hubVoice
    for (let i = 0; i < queue.length; i++) {
      if (mine !== run) return
      const piece = queue[i]!
      const shown = useSpeech.getState().caption
      if (shown) useSpeech.setState({ caption: { ...shown, at: i } })
      const audio = local ? null : await next
      next = local ? Promise.resolve(null) : fetchOf(queue[i + 1]) // fetched while this one plays
      if (mine !== run) return
      try {
        if (audio) {
          if (i === 0) showMedia(caption)
          await playAudio(audio)
        } else {
          showMedia(null) // the phone's own voice: nothing for the system to show
          if (!local && hubVoice) {
            local = true // the hub did not answer: the phone's voice from here on
            useSpeech.setState({ note: spokenIn(language).phoneVoice })
          }
          await sayLocally(piece, language)
        }
      } catch {
        if (mine !== run) return
        await sayLocally(piece, language).catch(() => undefined)
      }
    }
    if (mine === run) {
      ended()
      showMedia(null)
      useSpeech.setState({ speaking: false })
      captionDone()
    }
  })()
}

export function stopSpeaking() {
  run += 1
  synth()?.cancel()
  phoneVoiceDone('cancelled')
  playing?.pause()
  playing = null
  ended()
  showMedia(null)
  useSpeech.setState({ speaking: false })
  captionDone()
}

/** A spoken summary came (`spoken` stream frame): kept, and said when Read aloud is on and it is about the
 *  session in front. A summary that could not be made says why, then the reply's start. */
export function heardSummary(said: Said & { error?: Problem | null }, inFront: string | null) {
  const { readAloud, unheard } = useSpeech.getState()
  useSpeech.setState({ last: { key: said.key, text: said.text, reply: said.reply, language: said.language } })
  const away = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  if (!readAloud || said.key !== inFront || away) {
    // Not said later unasked: Play marks it new.
    if (said.text) useSpeech.setState({ unheard: { ...unheard, [said.key]: true } })
    return
  }
  heardNow(said.key)
  const title = nameOf(said.key)
  const language = said.language ?? languageOf(said.text ?? said.reply ?? '')
  if (said.text) speak(said.text, { title, language })
  else if (said.error)
    speak(`${problemSaid(said.error, language)}. ${speakable(said.reply ?? '', language).slice(0, PIECE)}`, { title, language })
}

/** There is nothing to read yet, said in the language of `about` (what is in front, if anything). */
export function nothingSaid(about: string): string {
  return spokenIn(languageOf(about)).nothing
}

/** Why nothing could be said, in the language spoken. */
export function problemSaid(problem: string, language: string): string {
  const words = spokenIn(language)
  return problem === 'unavailable' ? words.unavailable : problem === 'limit' ? words.limit : words.failed
}

const nameOf = (key: string) => {
  const front = useSpeech.getState().front
  return front?.key === key ? (front.name ?? '') : ''
}

function heardNow(key: string) {
  const { [key]: _, ...rest } = useSpeech.getState().unheard
  useSpeech.setState({ unheard: rest })
}

/** Says a summary of the session in front (Play), as `play.ts` found or made it. */
export function sayFound(key: string, text: string, reply: string, language?: string) {
  useSpeech.setState({ last: { key, text, reply, language } })
  heardNow(key)
  speak(text, { title: nameOf(key), language })
}

/** "Read all": the latest reply of the session in front, whole (no code read out). */
export function readAll(): boolean {
  const { front, last } = useSpeech.getState()
  const reply = front?.reply ?? (last && last.key === front?.key ? last.reply : null)
  if (!reply) return false
  if (front) heardNow(front.key)
  const language = languageOf(reply)
  speak(speakable(reply, language), { title: front?.name ?? '', kind: 'reply', language })
  return true
}
