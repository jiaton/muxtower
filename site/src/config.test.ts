import { describe, expect, it } from 'vitest'
import { config, demoUrl } from './config'

describe('config', () => {
  it('leaves repository links out when no repository is set', () => {
    expect(config.repoUrl).toBeNull()
    expect(config.securityUrl).toBeNull()
  })

  it('points at the demo build next to the page', () => {
    expect(demoUrl).toBe('/demo/')
  })
})
