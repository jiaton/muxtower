/** Every visit starts the same demo: nothing a reader did last time (drafts, list settings) is kept.
 *  Imported first, before any store reads storage. */
try {
  localStorage.clear()
  sessionStorage.clear()
} catch {
  // Storage is blocked: it holds nothing from last time either.
}
