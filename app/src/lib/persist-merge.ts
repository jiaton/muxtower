/**
 * How a persisted store (zustand `persist`) takes back what a browser kept: field by field, each only
 * when it has the shape this version's default has (an array for an array, an object for an object, a
 * number for a number…). A field an older or newer version wrote differently, or one this version no
 * longer has, falls back to the default, so what was kept can never break the app on open.
 */
export function mergeWithDefaults<T extends object>(persisted: unknown, current: T): T {
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) return current
  const defaults = current as Record<string, unknown>
  const out: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(persisted)) {
    if (!(key in defaults)) continue
    const fallback = defaults[key]
    if (typeof fallback === 'function') continue
    if (sameShape(fallback, value)) out[key] = value
  }
  return out as T
}

function sameShape(fallback: unknown, value: unknown): boolean {
  if (fallback === null || fallback === undefined) return true // nothing to compare with (an optional field)
  if (value === null || value === undefined) return false
  if (Array.isArray(fallback)) return Array.isArray(value)
  if (typeof fallback === 'object') return typeof value === 'object' && !Array.isArray(value)
  return typeof value === typeof fallback
}
