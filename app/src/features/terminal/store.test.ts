import { beforeEach, describe, expect, it } from 'vitest'
import { useDrafts } from './store'

describe('useDrafts', () => {
  beforeEach(() => useDrafts.setState({ drafts: {}, quotes: {}, filled: {} }))

  it('fills a whole message in place of the draft and its quotes, and counts it without saving that', () => {
    const { addQuote, setDraft, fill } = useDrafts.getState()
    addQuote('d1/a', 'pick a date')
    setDraft('d1/a', 'half a thought')
    fill('d1/a', '!npm test')
    expect(useDrafts.getState()).toMatchObject({ drafts: { 'd1/a': '!npm test' }, quotes: {}, filled: { 'd1/a': 1 } })
    expect(JSON.parse(localStorage.getItem('muxtower.drafts')!).state).not.toHaveProperty('filled')
  })

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
    expect(useDrafts.getState().quotes).toEqual({
      'd1/a': [
        { text: 'pick a date', reply: '' },
        { text: 'or 11/4', reply: '' },
      ],
    })
    setQuotes('d1/a', [])
    expect(useDrafts.getState().quotes).toEqual({})
  })

  it('keeps the quotes saved before they had replies of their own', async () => {
    localStorage.setItem(
      'muxtower.drafts',
      JSON.stringify({ version: 1, state: { drafts: { 'd1/a': 'hi' }, quotes: { 'd1/a': ['pick a date'] } } }),
    )
    await useDrafts.persist.rehydrate()
    expect(useDrafts.getState()).toMatchObject({ drafts: { 'd1/a': 'hi' }, quotes: { 'd1/a': [{ text: 'pick a date', reply: '' }] } })
  })
})
