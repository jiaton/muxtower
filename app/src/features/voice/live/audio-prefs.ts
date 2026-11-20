import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mergeWithDefaults } from '@/lib/persist-merge'

/**
 * How Live takes sound in and answers a car's controls, per browser (Daemons page › Live in the car):
 * - `mic`: which microphone Live listens on: the browser's default, the phone's own, or a Bluetooth one
 *   (a car's hands-free, a headset). Picked from the devices the browser lists (`mic.ts`).
 * - `processing`: the browser's voice processing (echo cancellation, noise suppression, auto gain). On, as
 *   always before; off, Chrome on Android need not put the phone in call mode, so a car may stay on media.
 * - `nextTrack`: what a car's ⏭ does while Live and Read aloud are on: Read all, or Live's send.
 */
export type MicSource = 'default' | 'phone' | 'bluetooth'
export type NextTrack = 'read' | 'send'

interface LiveAudioPrefs {
  mic: MicSource
  processing: boolean
  nextTrack: NextTrack
  setMic: (mic: MicSource) => void
  setProcessing: (on: boolean) => void
  setNextTrack: (next: NextTrack) => void
}

export const useLiveAudio = create<LiveAudioPrefs>()(
  persist(
    (set) => ({
      mic: 'default',
      processing: true,
      nextTrack: 'read',
      setMic: (mic) => set({ mic }),
      setProcessing: (processing) => set({ processing }),
      setNextTrack: (nextTrack) => set({ nextTrack }),
    }),
    {
      name: 'muxtower.live.audio',
      version: 1,
      merge: mergeWithDefaults,
      partialize: (s) => ({ mic: s.mic, processing: s.processing, nextTrack: s.nextTrack }),
    },
  ),
)
