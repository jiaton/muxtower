import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mergeWithDefaults } from '@/lib/persist-merge'

/**
 * Live's Read aloud: a listened session's turns said in a few words when they end (the daemon's spoken
 * summaries, `listen/`), its full reply on asking, by the browser's own speech (a Chinese voice when it has
 * one). Long text goes in pieces (a browser stops a long utterance). While it speaks, Live writes nothing:
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
}

interface SpeechState {
  readAloud: boolean
  setReadAloud: (on: boolean) => void
  speaking: boolean
  last: Said | null
  /** Sessions (`entryKey`) with a summary that came while away (page hidden, another session in front):
   *  not said unasked later; Play shows it is new. */
  unheard: Record<string, true>
  /** The session in front and its latest reply (Live's bar says), for Play and Read all. */
  front: { key: string; reply: string | null } | null
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
    }),
    { name: 'muxtower.read-aloud', version: 1, merge: mergeWithDefaults, partialize: (s) => ({ readAloud: s.readAloud }) },
  ),
)

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

/** What is said of a reply read whole: no code read out, nor markdown's marks. */
export function speakable(reply: string): string {
  return reply
    .replace(CODE, ' 一段代码。 ')
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

let voice: SpeechSynthesisVoice | null | undefined
function chineseVoice(): SpeechSynthesisVoice | null {
  if (voice === undefined || voice === null) {
    const voices = synth()?.getVoices() ?? []
    voice = voices.find((v) => v.lang === 'zh-CN') ?? voices.find((v) => v.lang.startsWith('zh')) ?? null
  }
  return voice
}

let run = 0 // each new speech: the ones before it stop

/** Says the text (cutting off whatever was being said), in pieces. */
export function speak(text: string) {
  const s = synth()
  if (!s || !text.trim()) return
  s.cancel()
  const mine = ++run
  const queue = pieces(text)
  began()
  useSpeech.setState({ speaking: true })
  const next = () => {
    if (mine !== run) return
    const piece = queue.shift()
    if (!piece) return (ended(), useSpeech.setState({ speaking: false }))
    const u = new SpeechSynthesisUtterance(piece)
    const zh = chineseVoice()
    if (zh) u.voice = zh
    u.lang = zh?.lang ?? 'zh-CN'
    u.onend = next
    u.onerror = () => mine === run && (ended(), useSpeech.setState({ speaking: false }))
    s.speak(u)
  }
  next()
}

export function stopSpeaking() {
  run += 1
  synth()?.cancel()
  ended()
  useSpeech.setState({ speaking: false })
}

/** A spoken summary came (`spoken` stream frame): kept, and said when Read aloud is on and it is about the
 *  session in front. A summary that could not be made says why, then the reply's start. */
export function heardSummary(said: Said & { error?: string | null }, inFront: string | null) {
  const { readAloud, unheard } = useSpeech.getState()
  useSpeech.setState({ last: { key: said.key, text: said.text, reply: said.reply } })
  const away = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  if (!readAloud || said.key !== inFront || away) {
    // Not said later unasked: Play marks it new.
    if (said.text) useSpeech.setState({ unheard: { ...unheard, [said.key]: true } })
    return
  }
  heardNow(said.key)
  if (said.text) speak(said.text)
  else if (said.error) speak(`${said.error}。${speakable(said.reply ?? '').slice(0, PIECE)}`)
}

function heardNow(key: string) {
  const { [key]: _, ...rest } = useSpeech.getState().unheard
  useSpeech.setState({ unheard: rest })
}

/** Says a summary of the session in front (Play), as `play.ts` found or made it. */
export function sayFound(key: string, text: string, reply: string) {
  useSpeech.setState({ last: { key, text, reply } })
  heardNow(key)
  speak(text)
}

/** "Read all": the latest reply of the session in front, whole (no code read out). */
export function readAll(): boolean {
  const { front, last } = useSpeech.getState()
  const reply = front?.reply ?? (last && last.key === front?.key ? last.reply : null)
  if (!reply) return false
  if (front) heardNow(front.key)
  speak(speakable(reply))
  return true
}
