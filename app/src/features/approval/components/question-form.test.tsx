import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { PendingQuestion } from '@/lib/api/types'
import { QuestionForm, needsForm } from './question-form'

const fruit: PendingQuestion = {
  question: 'Which fruits?', header: 'Fruit', multi_select: true,
  options: [{ label: 'Apple' }, { label: 'Banana' }, { label: 'Cherry', description: 'Dark red' }],
} // prettier-ignore
const size: PendingQuestion = { question: 'Which size?', multi_select: false, options: [{ label: 'Small' }, { label: 'Large' }] }

it('takes a form for several questions or several answers, not for a single choice', () => {
  expect(needsForm([fruit, size])).toBe(true)
  expect(needsForm([fruit])).toBe(true)
  expect(needsForm([size])).toBe(false)
  expect(needsForm(undefined)).toBe(false)
})

it('submits every question once each has an answer: any number where it takes several, one otherwise', () => {
  const submit = vi.fn()
  render(<QuestionForm questions={[fruit, size]} busy={false} onSubmit={submit} />)
  const send = screen.getByRole('button', { name: 'Submit answers' })
  fireEvent.click(screen.getByRole('checkbox', { name: /Apple/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Cherry/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Apple/ })) // and back out
  fireEvent.click(screen.getByRole('checkbox', { name: /Banana/ }))
  expect(send).toBeDisabled() // the size is not answered yet
  fireEvent.click(screen.getByRole('radio', { name: 'Small' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Large' }))
  fireEvent.click(send)
  expect(submit).toHaveBeenCalledWith([['Cherry', 'Banana'], ['Large']])
})
