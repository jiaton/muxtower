/** The demo keeps what it stores apart from the real app's: every key under `muxtower-demo:`, so a demo on
 *  the same origin as a real copy of the app (a site that embeds both) never reads, writes or clears its
 *  pairings (`muxtower.daemons`). Every visit starts the same demo: what a reader did last time (drafts,
 *  list settings) is dropped, the demo's own keys only. Imported first, before any store reads storage. */
const PREFIX = 'muxtower-demo:'

function namespaced(real: Storage): Storage {
  const own = () => Array.from({ length: real.length }, (_, i) => real.key(i)).filter((k): k is string => !!k?.startsWith(PREFIX))
  return {
    get length() {
      return own().length
    },
    key: (i) => own()[i]?.slice(PREFIX.length) ?? null,
    getItem: (key) => real.getItem(PREFIX + key),
    setItem: (key, value) => real.setItem(PREFIX + key, value),
    removeItem: (key) => real.removeItem(PREFIX + key),
    clear: () => own().forEach((k) => real.removeItem(k)),
  }
}

try {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const storage = namespaced(globalThis[name])
    Object.defineProperty(globalThis, name, { value: storage, configurable: true })
    storage.clear()
  }
} catch {
  // Storage is blocked: it holds nothing from last time either.
}

export {}
