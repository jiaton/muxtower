import { expect, it } from 'vitest'

it('keeps the demo’s storage apart: the real app’s pairings on the same origin stay as they are', async () => {
  const real = globalThis.localStorage
  real.setItem('muxtower.daemons', '{"real":true}')
  real.setItem('muxtower-demo:muxtower.drafts', 'from last visit')
  await import('./reset')
  expect(localStorage.getItem('muxtower.drafts')).toBeNull() // the demo's own: dropped each visit
  localStorage.setItem('muxtower.daemons', '{"demo":true}')
  expect(real.getItem('muxtower.daemons')).toBe('{"real":true}') // untouched
  expect(real.getItem('muxtower-demo:muxtower.daemons')).toBe('{"demo":true}')
  localStorage.clear()
  expect(real.getItem('muxtower.daemons')).toBe('{"real":true}')
})
