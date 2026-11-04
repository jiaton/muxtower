import { expect, it } from 'vitest'
import { isAppNavigation } from './sw-routes'

it('answers a reload of any page with the cached app, never an API call', () => {
  expect(isAppNavigation('/d/demo/s/abc123')).toBe(true)
  expect(isAppNavigation('/sub/path/daemons')).toBe(true)
  expect(isAppNavigation('/')).toBe(true)
  expect(isAppNavigation('/v1/sessions')).toBe(false)
  expect(isAppNavigation('/sub/v1/stream')).toBe(false)
  expect(isAppNavigation('/push/d1/')).toBe(false)
})
