/** A new version's service worker takes over the open app at once (sw.ts) and drops the old version's
 *  files, which the app still loads its pages from as they are opened. So the app reloads into the new
 *  version: at once when it is out of sight, else as soon as it is put away. The first worker taking
 *  over a page that came from the network changes nothing, and reloads nothing. */
export function reloadOnUpdate() {
  const workers = 'serviceWorker' in navigator ? navigator.serviceWorker : null
  if (!workers) return
  let controlled = Boolean(workers.controller)
  workers.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true
      return
    }
    if (document.visibilityState === 'hidden') location.reload()
    else document.addEventListener('visibilitychange', () => location.reload(), { once: true })
  })
}
