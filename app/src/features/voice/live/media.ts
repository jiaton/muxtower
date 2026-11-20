import { useAudioStatus } from './status'

/**
 * The phone's media controls (lock screen, notification shade, a car's dash and steering wheel over
 * Bluetooth): what this page tells them, and what their buttons do. Two things can make this page the
 * phone's media:
 * - the hub's voice playing (`speech.ts`): what is said, by which session;
 * - Live and Read aloud both on (`car-media.ts`): held all along, "muxtower · <session> · listening",
 *   paused while nothing is said, playing while something is.
 * While either is, every action handler is set (`play.ts` says what they do; ⏭ may be Live's send while
 * held); while neither is, none is, and the metadata is cleared, so the phone's other media keeps its own.
 */

export interface MediaActions {
  play: () => void
  stop: () => void
  next: () => void
  previous: () => void
}

export interface Saying {
  /** What is said (its start). */
  title: string
  /** Whose: the session's name. */
  artist: string
}

export interface Held {
  title: string
  /** Something is being said (in any voice). */
  playing: boolean
  /** ⏭ while held, when not Read all. */
  next?: () => void
}

let actions: MediaActions | null = null
let saying: Saying | null = null
let held: Held | null = null

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

function apply() {
  const m = session()
  if (!m) return
  if (!saying && !held) {
    m.metadata = null
    m.playbackState = 'none'
    setHandlers(m, null)
    useAudioStatus.setState({ handlers: false })
    return
  }
  if (typeof MediaMetadata !== 'undefined') {
    m.metadata = saying
      ? new MediaMetadata({ title: saying.title, artist: saying.artist, album: 'muxtower' })
      : new MediaMetadata({ title: held!.title, album: 'muxtower' })
  }
  m.playbackState = saying || held?.playing ? 'playing' : 'paused'
  setHandlers(m, actions && { ...actions, next: held?.next ?? actions.next })
  useAudioStatus.setState({ handlers: !!actions })
}

const ACTIONS: [MediaSessionAction, keyof MediaActions][] = [
  ['play', 'play'],
  ['pause', 'stop'],
  ['stop', 'stop'],
  ['nexttrack', 'next'],
  ['previoustrack', 'previous'],
]

function setHandlers(m: MediaSession, to: MediaActions | null) {
  for (const [action, does] of ACTIONS) {
    try {
      m.setActionHandler(action, to ? to[does] : null)
    } catch {
      // a browser without this action
    }
  }
}
