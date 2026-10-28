import { beforeEach, describe, expect, it } from 'vitest'
import { useDrafts } from './store'

describe('useDrafts', () => {
  beforeEach(() => useDrafts.setState({ drafts: {}, quotes: {} }))

  it('keeps a draft per session, saved on this device, and forgets an emptied one', () => {
    const { setDraft } = useDrafts.getState()
    setDraft('d1/a', 'half a thought')
    setDraft('d1/b', 'another')
    expect(useDrafts.getState().drafts).toEqual({ 'd1/a': 'half a thought', 'd1/b': 'another' })
    expect(JSON.parse(localStorage.getItem('muxtower.drafts')!).state.drafts['d1/a']).toBe('half a thought')
    setDraft('d1/a', '')
    expect(useDrafts.getState().drafts).toEqual({ 'd1/b': 'another' })
  })

  it('keeps the quotes of a draft apart from its text, once each, and forgets them emptied', () => {
    const { addQuote, setQuotes } = useDrafts.getState()
    addQuote('d1/a', '│ pick a date │')
    addQuote('d1/a', 'pick a date')
    addQuote('d1/a', '   ')
    addQuote('d1/a', 'or 11/4')
    expect(useDrafts.getState().quotes).toEqual({ 'd1/a': ['pick a date', 'or 11/4'] })
    setQuotes('d1/a', [])
    expect(useDrafts.getState().quotes).toEqual({})
  })
})
