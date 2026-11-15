/**
 * The last screen each session showed, kept in this browser (IndexedDB) so that opening one, even after a
 * reload, starts from what it last looked like instead of a blank view while the live screen comes. Only for
 * paired daemons (a browser with none keeps nothing), never in the demo, at most `KEPT` sessions, each at
 * most `MAX_CHARS` (its last lines). A daemon removed takes its sessions' screens with it.
 */

import { useEffect } from 'react'
import { useDaemonsStore } from '@/lib/daemons/store'

const DB = 'muxtower-screens'
const STORE = 'screens'
export const KEPT = 20
export const MAX_CHARS = 200_000

interface Kept {
  key: string // `${daemonId}/${sessionId}`
  daemonId: string
  ansi: string
  at: number
}

const keyOf = (daemonId: string, sessionId: string) => `${daemonId}/${sessionId}`

let opening: Promise<IDBDatabase | null> | null = null
function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined' || import.meta.env.MODE === 'demo') return Promise.resolve(null)
  opening ??= new Promise((resolve) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null) // private mode, blocked storage: nothing kept, nothing breaks
  })
  return opening
}

function done(request: IDBRequest | IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    if ('oncomplete' in request) request.oncomplete = () => resolve()
    else request.onsuccess = () => resolve()
    request.onerror = () => resolve()
  })
}

/** Its last lines, at most `MAX_CHARS`: a screen's top is what goes. */
export function capped(ansi: string): string {
  if (ansi.length <= MAX_CHARS) return ansi
  const cut = ansi.indexOf('\n', ansi.length - MAX_CHARS)
  return cut < 0 ? ansi.slice(-MAX_CHARS) : ansi.slice(cut + 1)
}

export async function loadScreen(daemonId: string, sessionId: string): Promise<string | undefined> {
  const db = await open()
  if (!db) return undefined
  const request = db.transaction(STORE).objectStore(STORE).get(keyOf(daemonId, sessionId))
  await done(request)
  return (request.result as Kept | undefined)?.ansi
}

export async function saveScreen(daemonId: string, sessionId: string, ansi: string): Promise<void> {
  const db = await open()
  if (!db) return
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  store.put({ key: keyOf(daemonId, sessionId), daemonId, ansi: capped(ansi), at: Date.now() } satisfies Kept)
  const all = store.getAll()
  all.onsuccess = () => {
    const kept = (all.result as Kept[]).sort((a, b) => b.at - a.at)
    for (const old of kept.slice(KEPT)) store.delete(old.key) // the least recently shown go
  }
  await done(tx)
}

/** Every screen kept but those of these daemons (one removed, or unpaired): gone. */
export async function keepOnly(daemonIds: readonly string[]): Promise<void> {
  const db = await open()
  if (!db) return
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const all = store.getAll()
  all.onsuccess = () => {
    for (const kept of all.result as Kept[]) if (!daemonIds.includes(kept.daemonId)) store.delete(kept.key)
  }
  await done(tx)
}

/** Mounted once (root layout): a daemon removed or unpaired takes its sessions' kept screens with it. */
export function useForgetRemovedScreens() {
  const paired = useDaemonsStore((s) =>
    s.daemons
      .filter((d) => d.token !== null)
      .map((d) => d.id)
      .join(','),
  )
  useEffect(() => {
    if (!useDaemonsStore.persist.hasHydrated()) return // not yet read back: no daemon is gone
    void keepOnly(paired ? paired.split(',') : [])
  }, [paired])
}
