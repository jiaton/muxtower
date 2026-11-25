import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { wrapper } from '@/test/render'
import { fakeHub, iso, item } from '../test/hub'
import type { InboxDirectory } from '../model/item'
import { InboxView } from './inbox-view'

const directory: InboxDirectory = {
  projects: [
    { name: 'acme/web', hue: 1 },
    { name: 'acme/api', hue: 2 },
  ],
  sessionName: (id) => ({ s1: 'checkout page' })[id],
}

afterEach(() => vi.restoreAllMocks())

const show = () => render(<InboxView directory={directory} />, { wrapper: wrapper() })
const rowOf = (text: string) => screen.getByText(text).closest('li')!
const menuOf = async (text: string) => {
  fireEvent.keyDown(within(rowOf(text)).getByRole('button', { name: 'More for this item' }), { key: 'Enter' })
  return screen.findByRole('menu')
}
const listed = () => [...document.querySelectorAll('li[data-item]')].map((li) => li.querySelector('p')?.textContent)

it('lists the items with their project, age, and to whom a handed one went', async () => {
  fakeHub([
    item(1, 'Plan the launch', { project: 'acme/web' }),
    item(2, 'Tidy the docs', {
      status: 'handed',
      project: 'acme/api',
      handed: { to_role: 'writer', to_session: 's1', project: 'acme/api', task_id: 3, at: iso(120) },
    }),
    item(3, 'Ask the session', {
      status: 'handed',
      handed: { to_role: null, to_session: 's1', project: 'acme/web', task_id: 4, at: iso(5) },
    }),
  ])
  show()
  await screen.findByText('Plan the launch')
  expect(within(rowOf('Plan the launch')).getByText('acme/web')).toHaveAttribute('data-hue', '1')
  expect(within(rowOf('Plan the launch')).getByText('1h')).toBeInTheDocument()
  expect(rowOf('Tidy the docs')).toHaveTextContent('Handed to writer in acme/api · 2h')
  expect(rowOf('Ask the session')).toHaveTextContent('Handed to checkout page in acme/web · 5m')
  expect(document.body.textContent).not.toMatch(/\bPM\b/)
})

it('ticks an item done, sending the version it read', async () => {
  const hub = fakeHub([item(1, 'Plan the launch', { version: 4 })])
  show()
  fireEvent.click(
    within(await screen.findByText('Plan the launch').then(() => rowOf('Plan the launch'))).getByRole('checkbox', { name: 'Done' }),
  )
  await waitFor(() => expect(hub.patches()).toEqual([{ method: 'PATCH', path: '/v1/inbox/1', body: { status: 'done', if_version: 4 } }]))
  await waitFor(() => expect(screen.queryByText('Plan the launch')).toBeNull())
})

it('edits inline: Enter saves, Esc puts it back', async () => {
  const hub = fakeHub([item(1, 'Plan the launch')])
  show()
  await screen.findByText('Plan the launch')
  fireEvent.click(within(await menuOf('Plan the launch')).getByRole('menuitem', { name: 'Edit' }))
  const field = await screen.findByRole('textbox', { name: 'Edit the item' })
  fireEvent.change(field, { target: { value: 'Plan the whole launch' } })
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByText('Plan the launch')).toBeInTheDocument()
  expect(hub.patches()).toEqual([])

  fireEvent.click(within(await menuOf('Plan the launch')).getByRole('menuitem', { name: 'Edit' }))
  const again = await screen.findByRole('textbox', { name: 'Edit the item' })
  fireEvent.change(again, { target: { value: 'Plan the whole launch' } })
  fireEvent.keyDown(again, { key: 'Enter' })
  await screen.findByText('Plan the whole launch')
  await waitFor(() => expect(hub.patches()[0]?.body).toEqual({ text: 'Plan the whole launch', if_version: 1 }))
}, 15_000)

it('deletes an item', async () => {
  const hub = fakeHub([item(1, 'Plan the launch'), item(2, 'Tidy the docs')])
  show()
  await screen.findByText('Plan the launch')
  fireEvent.click(within(await menuOf('Plan the launch')).getByRole('menuitem', { name: 'Delete' }))
  await waitFor(() => expect(screen.queryByText('Plan the launch')).toBeNull())
  expect(hub.sent).toEqual([{ method: 'DELETE', path: '/v1/inbox/1', body: null }])
})

it('sets the project from a list with colour dots', async () => {
  const hub = fakeHub([item(1, 'Plan the launch')])
  show()
  await screen.findByText('Plan the launch')
  fireEvent.click(within(await menuOf('Plan the launch')).getByRole('menuitem', { name: 'Set project' }))
  const dialog = await screen.findByRole('dialog', { name: 'Set project' })
  expect(dialog.querySelector('[data-hue="2"]')).not.toBeNull()
  fireEvent.click(within(dialog).getByRole('radio', { name: 'acme/api' }))
  await waitFor(() => expect(hub.patches()[0]?.body).toEqual({ project: 'acme/api', if_version: 1 }))
})

it('a change refused because the item changed elsewhere shows it as it is now, says so, and never writes over it', async () => {
  const hub = fakeHub([item(1, 'Plan the launch')])
  show()
  await screen.findByText('Plan the launch')
  hub.elsewhere(1, { text: 'Plan the launch for May' }) // another device, before this one read it again
  fireEvent.click(within(await menuOf('Plan the launch')).getByRole('menuitem', { name: 'Edit' }))
  const field = await screen.findByRole('textbox', { name: 'Edit the item' })
  fireEvent.change(field, { target: { value: 'Plan the launch for June' } })
  fireEvent.keyDown(field, { key: 'Enter' })

  const note = await screen.findByText(/This changed elsewhere, so your edit was not saved/)
  expect(screen.getByText('Plan the launch for May')).toBeInTheDocument() // the item as it is now
  expect(hub.items[0]!.text).toBe('Plan the launch for May')
  expect(hub.patches()).toHaveLength(1)

  // Only on the owner's word is theirs sent again, against the version now read.
  fireEvent.click(within(note.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Apply mine again' }))
  await waitFor(() => expect(hub.patches()[1]?.body).toEqual({ text: 'Plan the launch for June', if_version: 2 }))
  await screen.findByText('Plan the launch for June')
  expect(screen.queryByText(/changed elsewhere/)).toBeNull()
}, 15_000)

it('"Keep it as it is" lets the other change stand', async () => {
  const hub = fakeHub([item(1, 'Plan the launch')])
  show()
  await screen.findByText('Plan the launch')
  hub.elsewhere(1, { project: 'acme/web' })
  fireEvent.click(within(rowOf('Plan the launch')).getByRole('checkbox', { name: 'Done' }))
  await screen.findByText(/so ticking it done was not saved/)
  fireEvent.click(screen.getByRole('button', { name: 'Keep it as it is' }))
  expect(screen.queryByText(/changed elsewhere/)).toBeNull()
  expect(within(rowOf('Plan the launch')).getByText('acme/web')).toBeInTheDocument()
  expect(hub.patches()).toHaveLength(1)
})

it('"Show done (last 30 days)" reads the done items only once shown', async () => {
  const hub = fakeHub([item(1, 'Plan the launch')])
  hub.done = [item(9, 'Ship the beta', { status: 'done', done_at: iso(3 * 1440) })]
  show()
  await screen.findByText('Plan the launch')
  expect(screen.queryByText('Ship the beta')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Show done (last 30 days)' }))
  expect(await screen.findByText('Ship the beta')).toBeInTheDocument()
  expect(rowOf('Ship the beta')).toHaveTextContent('Done · 3d')
  expect(within(rowOf('Ship the beta')).getByRole('checkbox', { name: 'Not done' })).toBeChecked()
})

it('"Due soon" holds what is due or overdue, then the next 7 days, by date; the rest stays in the owner’s order', async () => {
  const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
  fakeHub([
    item(1, 'First of mine'),
    item(2, 'Due in three days', { due: day(3), due_state: 'upcoming' }),
    item(3, 'Due in a month', { due: day(30), due_state: 'upcoming' }),
    item(4, 'Overdue one', { due: day(-2), due_state: 'overdue' }),
    item(5, 'Last of mine'),
  ])
  show()
  const soon = await screen.findByRole('region', { name: 'Due soon' })
  expect(
    within(soon)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent),
  ).toEqual(['Overdue one', 'Due in three days'])
  const rest = screen.getByRole('region', { name: 'Items' })
  expect(
    within(rest)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent),
  ).toEqual(['First of mine', 'Due in a month', 'Last of mine'])
  expect(within(rowOf('Overdue one')).getByText('overdue')).toHaveAttribute('data-due', 'overdue')
  expect(within(rowOf('Due in three days')).getByText('in 3 days')).toBeInTheDocument()
})

it('nothing yet: says so, with the shortcut to add one', async () => {
  fakeHub([])
  show()
  expect(await screen.findByText('Nothing in your Inbox')).toBeInTheDocument()
  expect(screen.getByText('Alt+N')).toBeInTheDocument()
})

/** Each item 60 px tall, stacked in the order drawn (dnd-kit measures them). */
function stack() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rows = [...document.querySelectorAll('li[data-item]')]
    const i = rows.findIndex((r) => r === this || r.contains(this))
    const top = Math.max(0, i) * 60
    return { left: 0, width: 300, right: 300, top, height: 60, bottom: top + 60, x: 0, y: top, toJSON: () => ({}) } as DOMRect
  })
}

const three = () => [item(1, 'Alpha'), item(2, 'Bravo'), item(3, 'Charlie')]

it('reorders with the mouse on a handle, and keeps the order on the hub', async () => {
  const hub = fakeHub(three())
  const rect = stack()
  show()
  const handle = await screen.findByRole('button', { name: 'Move “Alpha”' })
  fireEvent.mouseDown(handle, { button: 0, clientX: 5, clientY: 10 })
  fireEvent.mouseMove(document, { clientX: 5, clientY: 20 })
  fireEvent.mouseMove(document, { clientX: 5, clientY: 90 })
  fireEvent.mouseMove(document, { clientX: 5, clientY: 140 }) // over Charlie
  fireEvent.mouseUp(document, { clientX: 5, clientY: 140 })
  await waitFor(() => expect(hub.sent).toEqual([{ method: 'PUT', path: '/v1/inbox/order', body: { ids: [2, 3, 1] } }]))
  await waitFor(() => expect(listed()).toEqual(['Bravo', 'Charlie', 'Alpha']))
  rect.mockRestore()
})

it('reorders by keyboard: Space lifts (announced), an arrow moves, Space puts it down', async () => {
  const hub = fakeHub(three())
  const rect = stack()
  show()
  const handle = await screen.findByRole('button', { name: 'Move “Alpha”' })
  handle.focus()
  fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
  await waitFor(() => expect(document.body.textContent).toMatch(/Picked up “Alpha”, item 1 of 3/))
  fireEvent.keyDown(handle, { code: 'ArrowDown', key: 'ArrowDown' })
  await waitFor(() => expect(document.body.textContent).toMatch(/Moved to place 2 of 3/))
  fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
  await waitFor(() => expect(hub.sent).toEqual([{ method: 'PUT', path: '/v1/inbox/order', body: { ids: [2, 1, 3] } }]))
  rect.mockRestore()
})

it('on a touch screen, a finger held still on a row picks it up; one that moves first scrolls and lifts nothing', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const hub = fakeHub(three())
  const rect = stack()
  try {
    show()
    const row = await screen.findByText('Bravo')
    fireEvent.touchStart(row, { touches: [{ clientX: 50, clientY: 70 }] })
    fireEvent.touchMove(row, { touches: [{ clientX: 50, clientY: 120 }] }) // a swipe: the list scrolls
    vi.advanceTimersByTime(600)
    fireEvent.touchEnd(row, { touches: [], changedTouches: [{ clientX: 50, clientY: 120 }] })
    expect(document.body.textContent).not.toMatch(/Picked up/)

    fireEvent.touchStart(row, { touches: [{ clientX: 50, clientY: 70 }] })
    vi.advanceTimersByTime(400)
    await waitFor(() => expect(screen.getAllByText('Bravo')).toHaveLength(2)) // lifted: its copy in hand
    // (jsdom gives dnd-kit no finger coordinates to follow: the drop is the e2e's, on a real touch screen.)
    fireEvent.touchEnd(row, { touches: [], changedTouches: [{ clientX: 50, clientY: 70 }] })
    expect(hub.sent).toEqual([])
  } finally {
    rect.mockRestore()
    vi.useRealTimers()
  }
})

it('an item asked for (a tapped notification) is marked and brought into view', async () => {
  const seen: Element[] = []
  Element.prototype.scrollIntoView = function (this: Element) {
    seen.push(this)
  }
  fakeHub([item(1, 'Alpha'), item(2, 'Bravo')])
  render(<InboxView directory={directory} focus={2} />, { wrapper: wrapper() })
  await screen.findByText('Bravo')
  expect(rowOf('Bravo')).toHaveAttribute('aria-current', 'true')
  expect(rowOf('Alpha')).not.toHaveAttribute('aria-current')
  expect(seen).toContain(rowOf('Bravo'))
})
