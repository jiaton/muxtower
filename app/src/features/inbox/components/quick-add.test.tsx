import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { wrapper } from '@/test/render'
import { SHORTCUTS } from '@/lib/shortcuts'
import { dayFromToday, dueBody } from '../model/due'
import { useQuickAdd } from '../store'
import { fakeHub, item } from '../test/hub'
import { QuickAddHost } from './quick-add'

const projects = [
  { name: 'acme/web', hue: 1 },
  { name: 'acme/api', hue: 2 },
]
const adds = (hub: ReturnType<typeof fakeHub>) => hub.sent.filter((s) => s.method === 'POST')

beforeEach(() => useQuickAdd.setState({ open: false }))

it('Alt+N is a global shortcut', () => {
  expect(SHORTCUTS.quickAdd).toMatchObject({ area: 'global', keys: [{ code: 'KeyN', alt: true }] })
})

it('Alt+N anywhere opens it, also while typing in a field; Enter adds the item with its project', async () => {
  const hub = fakeHub([item(1, 'Plan the launch')])
  render(
    <>
      <input aria-label="Message" />
      <QuickAddHost projects={projects} />
    </>,
    { wrapper: wrapper() },
  )
  const box = screen.getByRole('textbox', { name: 'Message' })
  box.focus()
  fireEvent.keyDown(box, { code: 'KeyN', key: 'ñ', altKey: true })
  const dialog = await screen.findByRole('dialog', { name: 'Add to Inbox' })
  const field = within(dialog).getByRole('textbox', { name: 'What to add' })
  expect(field).toHaveFocus()
  fireEvent.change(field, { target: { value: 'Try a darker chart' } })
  fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'acme/api' } })
  fireEvent.submit(field.closest('form')!)
  await waitFor(() =>
    expect(adds(hub)).toEqual([{ method: 'POST', path: '/v1/inbox', body: { text: 'Try a darker chart', project: 'acme/api' } }]),
  )
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('N without Alt types an N: nothing opens', () => {
  fakeHub([])
  render(<QuickAddHost projects={projects} />, { wrapper: wrapper() })
  fireEvent.keyDown(document.body, { code: 'KeyN', key: 'n' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('adds with a due date picked from the quick choices', async () => {
  const hub = fakeHub([])
  useQuickAdd.setState({ open: true })
  render(<QuickAddHost projects={projects} />, { wrapper: wrapper() })
  const dialog = await screen.findByRole('dialog', { name: 'Add to Inbox' })
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'What to add' }), { target: { value: 'Renew the certificate' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add a due date' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'In 30 days' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Inbox' }))
  await waitFor(() =>
    expect(adds(hub)[0]?.body).toEqual({
      text: 'Renew the certificate',
      project: null,
      ...dueBody(dayFromToday(30), null),
      on_due: 'remind',
      due_target: null,
    }),
  )
})
