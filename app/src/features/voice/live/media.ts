import { errorFields, logMedia } from './media-log'
import { useAudioStatus } from './status'

/**
 * The phone's media controls (lock screen, notification shade, a car's dash and steering wheel over
 * Bluetooth): what this page tells them, and what their buttons do. Two things can make this page the
 * phone's media:
 * - the hub's voice playing (`speech.ts`): what is said, by which session;
 * - Live and Read aloud both on (`car-media.ts`): held all along, "muxtower · <session> · listening",
 *   once its silent loop plays.
 * While either is, every action handler is set (`play.ts` says what they do; ⏭ may be Live's send while
 * held) and the state is "playing" the whole time (Chrome on Android offers ⏮ ⏭, to the notification and
 * over Bluetooth to a car, only for a session that plays; a paused one may show them greyed); while
 * neither is, none is, and the metadata is cleared, so the phone's other media keeps its own. Every
 * handler set, action received and what it did goes to the media log (`media-log.ts`).
 */

/** What a button did, for the log ("played", "nothing", "failed: …"). */
export type Outcome = string | void
export interface MediaActions {
  /** Play/pause, whichever the car sends: stops what is said, else plays the latest. */
  toggle: () => Outcome | Promise<Outcome>
  stop: () => Outcome | Promise<Outcome>
  next: () => Outcome | Promise<Outcome>
  previous: () => Outcome | Promise<Outcome>
}

export interface Saying {
  /** What is said (its start). */
  title: string
  /** Whose: the session's name. */
  artist: string
}

export interface Held {
  title: string
  /** ⏭ while held, when not Read all. */
  next?: () => Outcome | Promise<Outcome>
}

let actions: MediaActions | null = null
let saying: Saying | null = null
let held: Held | null = null
/** Called before each action: the hold's silent loop started again if the system paused it. */
let keeper: ((why: string) => void) | null = null

const session = () => (typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null)

/** What the media buttons do (`play.ts`): play/pause, next (read all), previous (play again). */
export function setMediaActions(next: MediaActions) {
  actions = next
  apply()
}

/** The hub's voice says this now (null: it stopped). */
export function showSaying(next: Saying | null) {
  saying = next
  apply()
}

/** Live and Read aloud hold the media controls (null: let go). */
export function holdMedia(next: Held | null) {
  held = next
  apply()
}

/** Run before every action (`car-media.ts`: its loop played again if the system paused it). */
export function setMediaKeeper(keep: ((why: string) => void) | null) {
  keeper = keep
}

/** A piece of the hub's voice ended: the handlers and the state set again, as Chrome may have handed the
 *  session's buttons to that element and taken them back with it. */
export function reassertMedia(why: string) {
  if (!saying && !held) return
  logMedia('reassert', { why })
  apply()
}

/** The hub's mp3 or the phone's own voice finished: the loop played again if something paused it meanwhile
 *  (Android may pause it while the phone's voice has the audio), and the handlers and state set again. */
export function afterOwnAudio(why: string) {
  keeper?.(why)
  reassertMedia(why)
}

/** An action as if the phone sent it (`car-media.ts`: a pause of its loop it did not ask for). */
export function runMediaAction(action: MediaSessionAction, via: string) {
  const does = ACTIONS.find(([a]) => a === action)?.[1]
  if (does && actions && (saying || held)) void handle(action, does, via)
}

function apply() {
  const m = session()
  if (!m) return
  if (!saying && !held) {
    if (m.metadata !== null || m.playbackState !== 'none') logMedia('state', { playback: 'none', meta: 'none' })
    m.metadata = null
    m.playbackState = 'none'
    setHandlers(m, false)
    useAudioStatus.setState({ handlers: false })
    return
  }
  if (typeof MediaMetadata !== 'undefined') {
    m.metadata = saying
      ? new MediaMetadata({ title: saying.title, artist: saying.artist, album: 'muxtower' })
      : new MediaMetadata({ title: held!.title, album: 'muxtower' })
  }
  m.playbackState = 'playing'
  logMedia('state', { playback: 'playing', meta: saying ? 'sentence' : 'listening' })
  setHandlers(m, !!actions)
  useAudioStatus.setState({ handlers: !!actions })
}

const ACTIONS: [MediaSessionAction, keyof MediaActions][] = [
  ['play', 'toggle'],
  ['pause', 'toggle'],
  ['stop', 'stop'],
  ['nexttrack', 'next'],
  ['previoustrack', 'previous'],
]

async function handle(action: MediaSessionAction, does: keyof MediaActions, via = 'system') {
  const started = performance.now()
  // Whether the browser counts this as the user's doing (a media button may not): play() may need it.
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean; hasBeenActive: boolean } }).userActivation
  logMedia('action', { action, via, activeNow: activation?.isActive, activeEver: activation?.hasBeenActive })
  keeper?.(action)
  const run = does === 'next' && held?.next ? held.next : actions?.[does]
  try {
    const did = await run?.()
    logMedia('action-done', { action, did: did ?? 'done', ms: performance.now() - started })
  } catch (error) {
    logMedia('action-failed', { action, ms: performance.now() - started, ...errorFields(error) })
  }
}

const handlers = new Map(ACTIONS.map(([action, does]) => [action, () => void handle(action, does)]))

function setHandlers(m: MediaSession, on: boolean) {
  const set: string[] = []
  for (const [action] of ACTIONS) {
    try {
      m.setActionHandler(action, on ? handlers.get(action)! : null)
      set.push(action)
    } catch (error) {
      logMedia('handler-failed', { action, on, ...errorFields(error) })
    }
  }
  logMedia('handlers', { on, set: set.join(',') })
}
