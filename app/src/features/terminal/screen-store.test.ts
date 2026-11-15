import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { KEPT, MAX_CHARS, capped, keepOnly, loadScreen, saveScreen } from './screen-store'

it('keeps a session’s last screen, its last lines when it is long, for the most recent sessions only', async () => {
  await saveScreen('hub', 's1', 'first\nscreen')
  expect(await loadScreen('hub', 's1')).toBe('first\nscreen')
  expect(await loadScreen('hub', 'nope')).toBeUndefined()

  const long = Array.from({ length: 30_000 }, (_, i) => `line ${i}`).join('\n')
  expect(capped(long).length).toBeLessThanOrEqual(MAX_CHARS)
  expect(capped(long).endsWith('line 29999')).toBe(true)
  expect(capped(long).startsWith('line ')).toBe(true) // cut at a line, not inside one

  for (let i = 0; i < KEPT + 5; i++) {
    await saveScreen('hub', `n${i}`, `screen ${i}`)
    await new Promise((r) => setTimeout(r, 2)) // each its own time
  }
  expect(await loadScreen('hub', 's1')).toBeUndefined() // the least recently shown went
  expect(await loadScreen('hub', `n${KEPT + 4}`)).toBe(`screen ${KEPT + 4}`)
})

it('forgets the screens of a daemon removed', async () => {
  await saveScreen('gone', 'a', 'x')
  await saveScreen('kept', 'b', 'y')
  await keepOnly(['kept'])
  expect(await loadScreen('gone', 'a')).toBeUndefined()
  expect(await loadScreen('kept', 'b')).toBe('y')
})
