import { create } from 'zustand'

/** Per daemon: the live stream's state. `blocked` = a sign-in gate in front of the daemon refused us
 *  (nothing is wrong with the token; the person has to sign in to the gate in this browser). */
export type StreamStatus = 'connecting' | 'open' | 'offline' | 'blocked'

export const useStreamStatus = create<{ status: Record<string, StreamStatus> }>(() => ({ status: {} }))

export const setStreamStatus = (id: string, status: StreamStatus) =>
  useStreamStatus.setState((s) => ({ status: { ...s.status, [id]: status } }))

export const markBlocked = (id: string) => setStreamStatus(id, 'blocked')

/** How often a daemon's queries poll, given its stream state. */
export const pollInterval = (status: StreamStatus | undefined): number | false =>
  status === 'open' ? false : status === 'blocked' ? 60_000 : 5_000
