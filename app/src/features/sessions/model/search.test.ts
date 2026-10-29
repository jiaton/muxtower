import { expect, it } from 'vitest'
import { isCurrentScope, parseListSearch, scopeSearch, toQuery } from './search'

it('keeps only known values from the URL', () => {
  expect(parseListSearch({ view: 'needs', group: 'source', device: 'hub', q: ' x ', extra: 1 })).toEqual({
    view: 'needs',
    group: 'source',
    device: 'hub',
    folder: undefined,
    source: undefined,
    q: ' x ',
  })
  expect(parseListSearch({ view: 'bogus', group: 'folder', q: '  ' })).toEqual({
    view: undefined,
    group: undefined,
    device: undefined,
    folder: undefined,
    source: undefined,
    q: undefined,
  })
})

it('fills defaults, also over a remembered grouping that no longer exists', () => {
  expect(toQuery({}, 'device')).toMatchObject({ view: 'all', group: 'device' })
  expect(toQuery({}, 'folder' as never).group).toBe('status')
})

it('switches scope without losing grouping or search', () => {
  const current = { view: 'needs' as const, group: 'device' as const, q: 'api', device: 'hub' }
  expect(scopeSearch(current, { device: 'hub', folder: '~/web' })).toEqual({
    group: 'device',
    q: 'api',
    view: undefined,
    device: 'hub',
    folder: '~/web',
    source: undefined,
  })
  expect(scopeSearch(current, { view: 'all' })).toMatchObject({ device: undefined, folder: undefined, view: undefined })
})

it('marks exactly the scope the list shows', () => {
  const search = { device: 'hub', folder: '~/web' }
  expect(isCurrentScope(search, { device: 'hub', folder: '~/web' })).toBe(true)
  expect(isCurrentScope(search, { device: 'hub' })).toBe(false)
  expect(isCurrentScope(search, { view: 'all' })).toBe(false)
  expect(isCurrentScope({}, { view: 'all' })).toBe(true)
  expect(isCurrentScope({ view: 'needs' }, { view: 'needs' })).toBe(true)
})

it('keeps an agent scope in the URL, apart from the others', () => {
  expect(parseListSearch({ agent: 'Codex' }).agent).toBe('Codex')
  expect(toQuery({ agent: 'Codex' }, 'status').agent).toBe('Codex')
  const search = scopeSearch({ device: 'hub', q: 'api' }, { agent: 'Codex' })
  expect(search).toMatchObject({ agent: 'Codex', device: undefined, q: 'api' })
  expect(isCurrentScope(search, { agent: 'Codex' })).toBe(true)
  expect(isCurrentScope(search, { view: 'all' })).toBe(false)
  expect(isCurrentScope({ agent: 'Codex', device: 'hub' }, { agent: 'Codex' })).toBe(false)
})
