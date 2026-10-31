/** What a deployment sets at build time (`MUXTOWER_SITE_*`); nothing about one is written in the source. */
const repo = (import.meta.env.MUXTOWER_SITE_REPO as string | undefined)?.replace(/\/+$/, '') || null

export const config = {
  /** The GitHub repository; links to it are left out when unset. */
  repoUrl: repo,
  securityUrl: repo ? `${repo}/blob/main/SECURITY.md` : null,
  readmeUrl: repo ? `${repo}#readme` : null,
  pypiUrl: 'https://pypi.org/project/muxtower/',
  /** The app's demo build, copied next to the site (`scripts/copy-demo.mjs`). */
  demoUrl: `${import.meta.env.BASE_URL}demo/`,
}

/** A page of the demo app: its session list, or one session. The demo routes by the URL's hash
 *  (`#/d/<daemon>/s/<session>`), so a static host serves every page of it from one index.html. */
export const demoPage = (sessionId?: string) =>
  sessionId ? `${config.demoUrl}#/d/demo/s/${encodeURIComponent(sessionId)}` : config.demoUrl
