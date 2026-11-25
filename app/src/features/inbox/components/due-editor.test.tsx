import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { wrapper } from '@/test/render'
import { dayFromToday, dueBody } from '../model/due'
import { fakeHub, item } from '../test/hub'
import { InboxView } from './inbox-view'

const directory = { projects: [{ name: 'acme/web', hue: 1 }], sessionName: () => undefined }

async function openDue(text: string, name: RegExp) {
  render(<InboxView directory={directory} />, { wrapper: wrapper() })
  const row = (await screen.findByText(text)).closest('li')!
  fireEvent.keyDown(within(row).getByRole('button', { name: 'More for this item' }), { key: 'Enter' })
  fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name }))
  return screen.findByRole('dialog', { name: 'Due date' })
}

it('sets a due date with a quick choice; reminding is the default', async () => {
  const hub = fakeHub([item(1, 'Plan the launch')])
  const dialog = await openDue('Plan the launch', /Set due date/)
  expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled() // no day yet
  expect(within(dialog).getByRole('radio', { name: 'Remind me' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(within(dialog).getByRole('button', { name: 'In a week' }))
  expect(within(dialog).getByRole('button', { name: 'In a week' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(hub.patches()[0]?.body).toEqual({ ...dueBody(dayFromToday(7), null), on_due: 'remind', due_target: null, if_version: 1 }),
  )
})

it('each quick choice picks its day, and a time can be added', async () => {
  const hub = fakeHub([item(1, 'Plan the launch')])
  const dialog = await openDue('Plan the launch', /Set due date/)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Tomorrow' }))
  expect(within(dialog).getByText(dueSummaryOf(1))).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'In 30 days' }))
  expect(within(dialog).getByText(dueSummaryOf(30))).toBeInTheDocument()
  fireEvent.change(within(dialog).getByLabelText('Time'), { target: { value: '16:45' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(hub.patches()[0]?.body).toMatchObject(dueBody(dayFromToday(30), '16:45')))
})

it('hands it off when due: the same picker, stored as due_target', async () => {
  const hub = fakeHub([item(1, 'Plan the launch', { project: 'acme/web' })], {
    'acme/web': { roles: [{ role: 'lead', sessions: 1 }], sessions: [{ id: 's3', name: 'planning', role: 'lead' }], default_role: 'lead' },
  })
  const dialog = await openDue('Plan the launch', /Set due date/)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Tomorrow' }))
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Hand off to…' }))
  expect(await within(dialog).findByText('Sends this as a task to lead in acme/web')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(hub.patches()[0]?.body).toMatchObject({
      on_due: 'hand_off',
      due_target: { project: 'acme/web', role: 'lead', session_id: null },
    }),
  )
})

it('clears a due date', async () => {
  const hub = fakeHub([item(1, 'Plan the launch', { due: new Date(Date.now() + 3 * 86_400_000).toISOString(), due_state: 'upcoming' })])
  const dialog = await openDue('Plan the launch', /Change due date/)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Clear due date' }))
  await waitFor(() => expect(hub.patches()[0]?.body).toEqual({ due: null, if_version: 1 }))
  await waitFor(() => expect(screen.queryByText('in 3 days')).toBeNull())
})

function dueSummaryOf(days: number) {
  return `Due ${dayFromToday(days).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
