/**
 * Records of tapped notifications (`push-click.ts`) waiting to be posted. The service worker has no
 * device token, so it keeps each record here (IndexedDB, the one store both it and the app's pages
 * reach) and the app posts them: at its next start, and shortly after a click it was told of.
 */
import type { PushClickRecord } from './push-click'

const DB = 'muxtower-push-clicks'
const STORE = 'records'
const KEEP = 50 // the newest; older ones are dropped unposted

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { autoIncrement: true })
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(STORE, mode)
        const request = work(tx.objectStore(STORE))
        tx.oncomplete = () => {
          d.close()
          resolve(request.result)
        }
        tx.onerror = tx.onabort = () => {
          d.close()
          reject(tx.error)
        }
      }),
  )
}

/** Keeps a record for the app to post; never throws. */
export async function savePushClick(record: PushClickRecord): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return
    await run('readwrite', (store) => store.add(record))
    const count = await run('readonly', (store) => store.count())
    if (count > KEEP) {
      const keys = await run('readonly', (store) => store.getAllKeys())
      await run('readwrite', (store) => store.delete(IDBKeyRange.upperBound(keys[count - KEEP - 1]!)))
    }
  } catch {
    // a log must never be what breaks
  }
}

/** Takes every kept record out (oldest first); never throws. */
export async function takePushClicks(): Promise<PushClickRecord[]> {
  try {
    if (typeof indexedDB === 'undefined') return []
    return await run('readwrite', (store) => {
      const all = store.getAll() as IDBRequest<PushClickRecord[]>
      store.clear() // in the same transaction: a record saved meanwhile is neither lost nor taken twice
      return all
    })
  } catch {
    return []
  }
}
