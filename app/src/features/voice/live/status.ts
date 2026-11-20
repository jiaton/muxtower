import { create } from 'zustand'

/**
 * What Live's audio is doing right now, for the diagnostics line (Daemons page › Live in the car): the
 * microphone in use (as the browser names it) and whether its voice processing is on, why the one chosen
 * is not in use, and whether the phone's media controls are held for Read aloud (handlers set, the silent
 * loop playing). Not kept: it says what is, while it is.
 */
export interface AudioStatus {
  /** The microphone Live listens on (its track's label), or null while Live is off. */
  input: string | null
  /** Voice processing as the browser applied it (its track's settings), null when unknown. */
  processing: boolean | null
  /** Why the microphone chosen is not the one in use ("not found: using the default"). */
  note: string | null
  /** The phone's media buttons answered by this page (every action handler set). */
  handlers: boolean
  /** The silent loop that keeps this page the phone's media while Live and Read aloud are on. */
  loop: 'off' | 'playing' | 'blocked'
}

export const useAudioStatus = create<AudioStatus>(() => ({
  input: null,
  processing: null,
  note: null,
  handlers: false,
  loop: 'off',
}))
