/** What a deployment sets at build time (`MUXTOWER_SITE_*`); nothing about one is written in the source. */
const repo = (import.meta.env.MUXTOWER_SITE_REPO as string | undefined)?.replace(/\/+$/, '') || null

export const config = {
  /** The GitHub repository; links to it are left out when unset. */
  repoUrl: repo,
  securityUrl: repo ? `${repo}/blob/main/SECURITY.md` : null,
  readmeUrl: repo ? `${repo}#readme` : null,
  pypiUrl: 'https://pypi.org/project/muxtower/',
  /** The public hosted copy of the real app, on an origin of its own; the entry to it is left out when unset. */
  appUrl: (import.meta.env.MUXTOWER_SITE_APP_URL as string | undefined)?.trim() || null,
}

/** The real app's demo build (against a daemon simulated in the page), copied next to the site by
 *  `scripts/copy-demo.mjs`. */
export const demoUrl = `${import.meta.env.BASE_URL}demo/`
