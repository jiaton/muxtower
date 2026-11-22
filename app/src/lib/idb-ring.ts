/**
 * A small log in IndexedDB, the one store both the service worker and the app's pages reach: records
 * under increasing keys, the newest `keep` kept. Every call is safe to make anywhere and never throws (a
 * log must never be what breaks): without IndexedDB it keeps nothing.
 */
export interface Ring<T> {
  add: (record: T) => Promise<void>
  /** Every record kept, oldest first, with its key. */
  all: () => Promise<{ key: number; record: T }[]>
  /** Takes every record out, oldest first. */
  take: () => Promise<T[]>
}

const STORE = 'records'

export function idbRing<T>(name: string, keep: number): Ring<T> {
  const db = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(name, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(STORE, { autoIncrement: true })
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
  const run = <R>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<R>): Promise<R> =>
    db().then(
      (d) =>
        new Promise<R>((resolve, reject) => {
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
  const usable = () => typeof indexedDB !== 'undefined'

  return {
    async add(record) {
      try {
        if (!usable()) return
        await run('readwrite', (store) => store.add(record))
        const count = await run('readonly', (store) => store.count())
        if (count > keep) {
          const keys = await run('readonly', (store) => store.getAllKeys())
          await run('readwrite', (store) => store.delete(IDBKeyRange.upperBound(keys[count - keep - 1]!)))
        }
      } catch {
        // a log must never be what breaks
      }
    },
    async all() {
      try {
        if (!usable()) return []
        const [keys, records] = await Promise.all([
          run('readonly', (store) => store.getAllKeys()),
          run('readonly', (store) => store.getAll() as IDBRequest<T[]>),
        ])
        return records.map((record, i) => ({ key: Number(keys[i]), record }))
      } catch {
        return []
      }
    },
    async take() {
      try {
        if (!usable()) return []
        return await run('readwrite', (store) => {
          const all = store.getAll() as IDBRequest<T[]>
          store.clear() // in the same transaction: a record saved meanwhile is neither lost nor taken twice
          return all
        })
      } catch {
        return []
      }
    },
  }
}
