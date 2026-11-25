import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { wrapper } from '@/test/render'
import { fakeHub, item } from '../test/hub'
import { HandDialog } from './hand-dialog'

const projects = [
  { name: 'acme/web', hue: 1 },
  { name: 'acme/api', hue: 2 },
  { name: 'acme/new', hue: 3 },
]
const TEAM = {
  roles: [
    { role: 'lead', sessions: 1 },
    { role: 'worker', sessions: 2 },
  ],
  sessions: [
    { id: 's1', name: 'checkout page', role: 'worker' },
    { id: 's2', name: 'search box', role: 'worker' },
    { id: 's3', name: 'planning', role: 'lead' },
  ],
}

function setup(defaultRole: string | null = 'lead') {
  const it1 = item(1, 'Plan the launch', { project: 'acme/web' })
  const hub = fakeHub([it1], {
    'acme/web': { ...TEAM, default_role: defaultRole },
    'acme/api': {
      roles: [{ role: 'reviewer', sessions: 1 }],
      sessions: [{ id: 's9', name: 'api review', role: 'reviewer' }],
      default_role: null,
    },
  })
  let closed = 0
  render(<HandDialog item={it1} projects={projects} onClose={() => closed++} />, { wrapper: wrapper() })
  return { hub, closed: () => closed }
}
const hands = (hub: ReturnType<typeof setup>['hub']) => hub.sent.filter((s) => s.path.endsWith('/hand'))

it('starts on the item’s project with its default role picked: handing is one click', async () => {
  const { hub, closed } = setup()
  const roles = await screen.findByRole('radiogroup', { name: 'Role' })
  expect(within(roles).getByRole('radio', { name: /lead/ })).toHaveAttribute('aria-checked', 'true')
  expect(within(roles).getByRole('radio', { name: /lead/ })).toHaveTextContent('Default')
  expect(within(roles).getByRole('radio', { name: /worker/ })).toHaveTextContent('2 sessions')
  expect(screen.getByRole('radio', { name: 'acme/web' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByText('Sends this as a task to lead in acme/web')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hand to lead' }))
  await waitFor(() =>
    expect(hands(hub)).toEqual([
      { method: 'POST', path: '/v1/inbox/1/hand', body: { project: 'acme/web', role: 'lead', session_id: null } },
    ]),
  )
  await waitFor(() => expect(closed()).toBe(1))
})

it('hands to one session, picked from the project’s sessions', async () => {
  const { hub } = setup()
  fireEvent.click(await screen.findByRole('button', { name: 'Or a specific session · 3' }))
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Session' })).getByRole('radio', { name: /search box/ }))
  expect(screen.getByText('Sends this as a task to search box')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hand to search box' }))
  await waitFor(() => expect(hands(hub)[0]?.body).toEqual({ project: 'acme/web', role: null, session_id: 's2' }))
})

it('another project: its own roles; one with no sessions says there is no one to hand to yet', async () => {
  setup()
  await screen.findByRole('radiogroup', { name: 'Role' })
  fireEvent.click(screen.getByRole('radio', { name: 'acme/api' }))
  expect(await screen.findByRole('radio', { name: /reviewer/ })).toHaveAttribute('aria-checked', 'false') // no default there
  expect(screen.getByRole('button', { name: 'Hand to…' })).toBeDisabled()
  fireEvent.click(screen.getByRole('radio', { name: 'acme/new' }))
  expect(await screen.findByText('No one to hand to yet')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Hand to…' })).toBeDisabled()
})

it('"Make this the default" keeps the picked role as the project’s default', async () => {
  const { hub } = setup(null)
  const roles = await screen.findByRole('radiogroup', { name: 'Role' })
  expect(screen.queryByText(/Sends this/)).toBeNull() // no default: nothing picked yet
  fireEvent.click(within(roles).getByRole('radio', { name: /worker/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Make this the default' }))
  await waitFor(() => expect(hub.sent).toContainEqual({ method: 'PUT', path: '/v1/projects/acme%2Fweb/handoff', body: { role: 'worker' } }))
  await waitFor(() => expect(within(roles).getByRole('radio', { name: /worker/ })).toHaveTextContent('Default'))
  expect(screen.queryByRole('button', { name: 'Make this the default' })).toBeNull()
})

it('a refused hand-off shows the hub’s reason, stays open, and offers to pick a session instead', async () => {
  const { hub, closed } = setup()
  hub.refuseHand = '2 sessions in acme/web hold the role worker: pick one of them'
  fireEvent.click(within(await screen.findByRole('radiogroup', { name: 'Role' })).getByRole('radio', { name: /worker/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Hand to worker' }))
  expect(await screen.findByText('2 sessions in acme/web hold the role worker: pick one of them')).toBeInTheDocument()
  expect(closed()).toBe(0)
  // Offered: name one of the sessions instead.
  fireEvent.click(screen.getByRole('button', { name: 'Pick a session instead' }))
  expect(screen.queryByText(/hold the role worker/)).toBeNull()
  hub.refuseHand = null
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Session' })).getByRole('radio', { name: /checkout page/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Hand to checkout page' }))
  await waitFor(() => expect(hands(hub).at(-1)?.body).toEqual({ project: 'acme/web', role: null, session_id: 's1' }))
  await waitFor(() => expect(closed()).toBe(1))
})

it('a role picked before that no one holds now stays picked, said so', async () => {
  fakeHub([item(1, 'Plan the launch')], { 'acme/web': { ...TEAM, default_role: null } })
  const { useHandPick, HandPicker } = await import('./hand-picker')
  function Harness() {
    const pick = useHandPick('acme/web', { project: 'acme/web', role: 'designer', session_id: null })
    return <HandPicker pick={pick} projects={projects} />
  }
  render(<Harness />, { wrapper: wrapper() })
  const designer = await screen.findByRole('radio', { name: /designer/ })
  expect(designer).toHaveAttribute('aria-checked', 'true')
  expect(designer).toHaveTextContent('no one holds it now')
})
