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

// One single-choice question with mockups (made-up content), as the agent's hook gives it.
const highlight: PendingQuestion = {
  question: 'How should the open session stand out?', header: 'Highlight', multi_select: false,
  options: [
    { label: 'Accent bar + tint (Recommended)', description: 'A bar and a tint', preview: '┌────────────┐\n│ ▍● planner │\n│ ○ 天气 19h  │\n└────────────┘' },
    { label: 'Solid accent row', description: 'The whole row in the accent' },
    { label: 'Outline card', preview: '╭────╮\n│ 圆角 │\n╰────╯' },
  ],
} // prettier-ignore

it('answers a single choice with one tap, by the label the agent gave', () => {
  const submit = vi.fn()
  render(<QuestionForm questions={[highlight]} busy={false} onSubmit={submit} />)
  expect(screen.queryByRole('button', { name: /Submit answers/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Outline card/ }))
  expect(submit).toHaveBeenCalledWith([['Outline card']])
})

it('shows the mockup of the option pointed at, else the first, and none glued onto the labels', () => {
  render(<QuestionForm questions={[highlight]} busy={false} onSubmit={() => {}} />)
  const labels = screen.getAllByRole('button').map((b) => b.textContent)
  expect(labels).toEqual([
    'Accent bar + tint (Recommended)A bar and a tint',
    'Solid accent rowThe whole row in the accent',
    'Outline card',
  ])
  expect(screen.getByLabelText('Preview').textContent).toContain('○ 天气 19h')
  fireEvent.mouseEnter(screen.getByRole('button', { name: /Outline card/ }))
  expect(screen.getByLabelText('Preview').textContent).toBe('╭────╮\n│ 圆角 │\n╰────╯')
  fireEvent.mouseEnter(screen.getByRole('button', { name: /Solid accent row/ }))
  expect(screen.queryByLabelText('Preview')).toBeNull()
  expect(screen.getByText('No preview for this option')).toBeTruthy()
})
