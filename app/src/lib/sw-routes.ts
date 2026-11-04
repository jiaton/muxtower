/** Navigations the service worker answers with the cached app (`index.html`), so a reload of any page of
 *  the app shows it even when the daemon behind it does not answer (its machine restarting): every path
 *  but the API's and the push registrations' scopes. When the cache is gone too (evicted, or a device that
 *  never opened the app), open another daemon's own address: each serves the same app. */
export const NOT_THE_APP: RegExp[] = [/\/v1\//, /\/push\/[^/]+\//]

export const isAppNavigation = (pathname: string) => !NOT_THE_APP.some((r) => r.test(pathname))
