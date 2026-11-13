import { describe, expect, it } from 'vitest'
import { routePattern, scrubReport, secretsOf } from './web-analytics'

const ORIGIN = 'https://app.example'

describe('routePattern', () => {
  it('names the ids of each route and drops the query and hash', () => {
    expect(routePattern('/d/k3x9/s/sess-42?view=all#x')).toBe('/d/:daemon/s/:session')
    expect(routePattern('/daemons/k3x9/settings')).toBe('/daemons/:daemon/settings')
    expect(routePattern('/pair?code=ABCD-1234')).toBe('/pair')
    expect(routePattern('/')).toBe('/')
    expect(routePattern('/something/new')).toBe('/:id/:id')
  })
  it('keeps a sub-path base', () => {
    expect(routePattern('/app/d/k3x9/s/x1', '/app/')).toBe('/app/d/:daemon/s/:session')
  })
})

describe('scrubReport', () => {
  const href = `${ORIGIN}/d/k3x9daemon/s/sess-42abc?folder=secret-project`
  const secrets = secretsOf([href])

  it('reports route patterns, other origins bare, and no id anywhere', () => {
    const body = JSON.stringify({
      location: href,
      referrer: 'https://github.com/someone/private-repo',
      timingsV2: { name: href },
      landingPath: '/d/k3x9daemon/s/sess-42abc',
      element: 'div[data-id="sess-42abc"]',
      siteToken: '0123456789abcdef0123456789abcdef',
      versions: { js: '2024.6.1' },
      n: 3,
    })
    const out = scrubReport(body, ORIGIN, '/', secrets)
    expect(JSON.parse(out)).toEqual({
      location: `${ORIGIN}/d/:daemon/s/:session`,
      referrer: 'https://github.com/',
      timingsV2: { name: `${ORIGIN}/d/:daemon/s/:session` },
      landingPath: '/d/:daemon/s/:session',
      element: 'div[data-id=":id"]',
      siteToken: '0123456789abcdef0123456789abcdef',
      versions: { js: '2024.6.1' },
      n: 3,
    })
    for (const s of ['k3x9daemon', 'sess-42abc', 'secret-project', 'private-repo']) expect(out).not.toContain(s)
  })

  it('throws on what is not JSON, so the caller drops it', () => {
    expect(() => scrubReport('not json', ORIGIN, '/', secrets)).toThrow()
  })
})
