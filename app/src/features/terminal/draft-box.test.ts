import { afterEach, expect, it } from 'vitest'
import { draftBox, submitters } from './draft-box'
import { useDrafts } from './store'

const A = { daemonId: 'nas', sessionId: 's1' }

afterEach(() => {
  useDrafts.setState({ drafts: {}, quotes: {} })
  submitters.clear()
  document.body.innerHTML = ''
})

it('appends at the end of the box, takes back the last words, clears the box (not its quotes)', () => {
  useDrafts.getState().setDraft('nas/s1', 'typed first')
  useDrafts.getState().addQuote('nas/s1', 'a quote')
  draftBox.append(A, 'first part')
  draftBox.append(A, 'second part')
  expect(useDrafts.getState().drafts['nas/s1']).toBe('typed first first part second part')
  expect(draftBox.undo(A)).toBe(true)
  expect(useDrafts.getState().drafts['nas/s1']).toBe('typed first first part')
  draftBox.clear(A)
  expect(useDrafts.getState().drafts['nas/s1'] ?? '').toBe('')
  expect(useDrafts.getState().quotes['nas/s1']).toHaveLength(1)
  expect(draftBox.undo(A)).toBe(false) // nothing appended left
})

it("goes into a quote's reply when that is the field in focus", () => {
  useDrafts.getState().addQuote('nas/s1', 'Pick a date')
  const field = document.createElement('textarea')
  field.dataset.quote = 'Pick a date'
  field.dataset.draft = 'nas/s1'
  document.body.append(field)
  field.focus()
  draftBox.append(A, '11/9')
  expect(useDrafts.getState().quotes['nas/s1']![0]!.reply).toBe('11/9')
  expect(useDrafts.getState().drafts['nas/s1'] ?? '').toBe('')
  draftBox.undo(A)
  expect(useDrafts.getState().quotes['nas/s1']![0]!.reply).toBe('')
})

it('sends through the shown box, as Send does; with no box shown, nothing is sent', () => {
  expect(draftBox.send(A)).toBe('empty')
  submitters.set('nas/s1', () => 'sent')
  expect(draftBox.send(A)).toBe('sent')
})

it('tells the box words landed, so it can show it a moment', () => {
  const before = useDrafts.getState().landed['nas/s1'] ?? 0
  draftBox.append(A, 'hi')
  expect(useDrafts.getState().landed['nas/s1']).toBe(before + 1)
})
