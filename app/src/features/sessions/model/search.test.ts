import { expect, it } from 'vitest'
import { parseListSearch, scopeSearch, toQuery } from './search'

it('keeps only known values from the URL', () => {
  expect(parseListSearch({ view: 'needs', group: 'folder', device: 'hub', q: ' x ', extra: 1 })).toEqual({
    view: 'needs',
    group: 'folder',
    device: 'hub',
    folder: undefined,
    q: ' x ',
  })
  expect(parseListSearch({ view: 'bogus', group: 7, q: '  ' })).toEqual({
    view: undefined,
    group: undefined,
    device: undefined,
    folder: undefined,
    q: undefined,
  })
})

it('fills defaults and switches scope without losing grouping or search', () => {
  expect(toQuery({}, 'device')).toEqual({ view: 'all', group: 'device', device: undefined, folder: undefined, q: undefined })
  const current = { view: 'needs' as const, group: 'folder' as const, q: 'api', device: 'hub' }
  expect(scopeSearch(current, { folder: '~/web' })).toEqual({
    group: 'folder',
    q: 'api',
    view: undefined,
    device: undefined,
    folder: '~/web',
  })
  expect(scopeSearch(current, { view: 'all' })).toEqual({
    group: 'folder',
    q: 'api',
    view: undefined,
    device: undefined,
    folder: undefined,
  })
})
