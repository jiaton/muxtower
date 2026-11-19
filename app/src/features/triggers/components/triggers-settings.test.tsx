import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { addDaemon, wrapper } from '@/test/render'
import { firing, serveTriggers, TRIGGER } from '../test-daemon'
import { http, HttpResponse } from 'msw'
import { DAEMON_URL, server } from '@/test/server'
import { BYPASS_WARNING } from './action-fields'
import { START_MODE_SETTING, TriggersSettings } from './triggers-settings'

function show() {
  const daemon = addDaemon()
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <TriggersSettings daemonId={daemon.id} />
    </Wrapper>,
  )
}

beforeEach(() => {
  // Radix's Switch measures itself; jsdom has no ResizeObserver.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  return () => vi.unstubAllGlobals()
})

const dialog = () => screen.getByRole('dialog')

it('lists each trigger: on or paused, what it does, its limits, its last firing', async () => {
  serveTriggers([TRIGGER, { ...TRIGGER, id: 'quiet', name: 'quiet', enabled: false, action: { kind: 'notify' }, dedupe: null, rate_per_hour: null, last_fired_at: null, last_outcome: null }])
  show()
  const rows = await screen.findAllByRole('listitem')
  expect(within(rows[0]!).getByRole('img', { name: 'On' })).toBeInTheDocument()
  expect(rows[0]).toHaveTextContent('→ buyer@acme/deals')
  expect(rows[0]).toHaveTextContent('3/h · dedupe 7d')
  expect(rows[0]).toHaveTextContent('Failed12m ago')
  expect(within(rows[1]!).getByRole('img', { name: 'Paused' })).toBeInTheDocument()
  expect(rows[1]).toHaveTextContent('notify')
  expect(rows[1]).toHaveTextContent('Never fired')
  expect(within(rows[1]!).getByRole('button', { name: 'Resume quiet' })).toBeInTheDocument()
})

it('pauses a trigger from its row', async () => {
  const sent = serveTriggers()
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Pause deals' }))
  await waitFor(() => expect(sent).toEqual([['PATCH deals', { enabled: false, clear_dedupe: false, clear_rate: false }]]))
  expect(await screen.findByRole('button', { name: 'Resume deals' })).toBeInTheDocument()
})

it('creates one and shows its secret once, with how to fire it', async () => {
  const sent = serveTriggers([])
  show()
  expect(await screen.findByText('No triggers yet.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'New trigger' }))
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Create' }))
  expect(within(dialog()).getByText('Give it a name.')).toBeInTheDocument() // nothing sent while it is wrong
  fireEvent.change(within(dialog()).getByRole('textbox', { name: /^Name/ }), { target: { value: 'deals' } })
  fireEvent.change(within(dialog()).getByRole('combobox', { name: /^To/ }), { target: { value: 'careful@acme/deals' } })
  expect(await within(dialog()).findByText('→ careful in acme/deals')).toBeInTheDocument()
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Create' }))
  await waitFor(() => expect(sent.map(([w]) => w)).toEqual(['POST /v1/triggers']))
  expect(sent[0]![1]).toMatchObject({ name: 'deals', enabled: true, action: { kind: 'deliver', to: 'careful@acme/deals' } })
  expect(await within(dialog()).findByLabelText('Trigger secret')).toHaveTextContent('made-up-secret-1')
  expect(within(dialog()).getByRole('button', { name: 'Copy the secret' })).toBeInTheDocument()
  expect(within(dialog()).getByText(/curl -X POST 'http:\/\/<hub-LAN-address>:8731\/v1\/triggers\/deals\/fire'/)).toBeInTheDocument()
  expect(within(dialog()).getByText(/muxtower trigger deals --data -/)).toBeInTheDocument()
  expect(within(dialog()).getByText(/The public hostname won't work for triggers yet\./)).toBeInTheDocument()
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByText('made-up-secret-1')).toBeNull()) // and never again
})

it('warns when a deliver target runs in bypass mode, and says when nothing has the role yet', async () => {
  serveTriggers([])
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'New trigger' }))
  const to = within(dialog()).getByRole('combobox', { name: /^To/ })
  fireEvent.change(to, { target: { value: 'careful@acme/deals' } })
  await waitFor(() => expect(within(dialog()).getByText('→ careful in acme/deals')).toBeInTheDocument())
  expect(within(dialog()).queryByText(BYPASS_WARNING)).toBeNull()
  fireEvent.change(to, { target: { value: 'buyer@acme/deals' } })
  expect(within(dialog()).getByText(BYPASS_WARNING)).toBeInTheDocument()
  fireEvent.change(to, { target: { value: 'nobody@acme/deals' } })
  expect(within(dialog()).getByText(/No such session or role yet/)).toBeInTheDocument()
})

it('edits filters: adds, changes and removes one, and saves the whole of them', async () => {
  const sent = serveTriggers()
  show()
  fireEvent.click(await screen.findByText('deals'))
  expect(within(dialog()).getAllByRole('group', { name: /^Filter / })).toHaveLength(1)
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Add a filter' }))
  const second = within(dialog()).getByRole('group', { name: 'Filter 2' })
  fireEvent.change(within(second).getByRole('textbox', { name: 'Field' }), { target: { value: 'deal.shop' } })
  fireEvent.change(within(second).getByRole('combobox', { name: 'Test' }), { target: { value: 'contains' } })
  fireEvent.change(within(second).getByRole('textbox', { name: 'Value' }), { target: { value: 'acme' } })
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Remove filter 1' }))
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0]).toEqual([
    'PATCH deals',
    expect.objectContaining({ filter: [{ field: 'deal.shop', op: 'contains', value: 'acme' }], dedupe: { days: 7, field: null }, rate_per_hour: 3 }),
  ])
})

it('fires a test with a sample payload and shows the firing it made', async () => {
  const sent = serveTriggers()
  show()
  fireEvent.click(await screen.findByText('deals'))
  fireEvent.click(within(dialog()).getByRole('radio', { name: 'Test' }))
  const box = within(dialog()).getByRole('textbox', { name: 'Sample payload' })
  expect(JSON.parse((box as HTMLTextAreaElement).value)).toHaveProperty('deal.price') // its filter's field, filled in
  fireEvent.change(box, { target: { value: '{"deal": ' } })
  expect(within(dialog()).getByRole('button', { name: 'Fire test' })).toBeDisabled()
  fireEvent.change(box, { target: { value: '{"deal": {"price": "9.50"}}' } })
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Fire test' }))
  const result = await within(dialog()).findByRole('region', { name: 'Test result' })
  expect(result).toHaveTextContent('Failed')
  expect(result).toHaveTextContent('not built yet')
  expect(sent).toEqual([['POST test', { payload: { deal: { price: '9.50' } }, key: null }]])
})

it('shows the log newest first, each outcome by its word, with target and detail', async () => {
  serveTriggers([TRIGGER], [
    firing(3, 'filtered', { detail: 'deal.price did not match' }),
    firing(1, 'delivered', { target: 'buyer1' }),
    firing(2, 'rate_limited', { via: 'cli' }),
  ]) // prettier-ignore
  show()
  fireEvent.click(await screen.findByText('deals'))
  fireEvent.click(within(dialog()).getByRole('radio', { name: 'Log' }))
  const lines = await within(dialog()).findAllByRole('listitem')
  expect(lines.map((l) => l.textContent)).toEqual([
    expect.stringMatching(/^Delivered.*webhook.*→ buyer1$/),
    expect.stringMatching(/^Rate limited.*command line/),
    expect.stringMatching(/^Filtered.*webhook.*deal\.price did not match$/),
  ])
})

it('deletes only after asking', async () => {
  const sent = serveTriggers()
  show()
  fireEvent.click(await screen.findByText('deals'))
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))
  expect(sent).toEqual([])
  const confirm = screen.getByRole('dialog', { name: 'Delete deals?' })
  fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(sent).toEqual([['DELETE deals', null]]))
})

it('the start form says the mode its sessions start in for the agent picked, and links to the setting', async () => {
  serveTriggers([])
  server.use(
    http.get(`${DAEMON_URL}/v1/runtimes`, () =>
      HttpResponse.json([
        { name: 'claude-code', binary: 'claude', available: true, has_hooks: true },
        { name: 'codex', binary: 'codex', available: true, has_hooks: true },
      ]),
    ),
  )
  const row = document.createElement('li')
  row.id = START_MODE_SETTING
  row.scrollIntoView = vi.fn()
  document.body.append(row)
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'New trigger' }))
  fireEvent.click(within(dialog()).getByRole('radio', { name: 'Start a session' }))
  expect(await within(dialog()).findByText(/Starts in:/)).toHaveTextContent('Starts in: Ask before acting (the default: auto is above it)')
  fireEvent.change(within(dialog()).getByRole('combobox', { name: 'Agent' }), { target: { value: 'codex' } })
  expect(within(dialog()).getByText(/Starts in:/)).toHaveTextContent('Starts in: Ask when it wants to · Settings › Triggers')
  fireEvent.click(within(dialog()).getByRole('button', { name: 'Settings › Triggers' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(() => expect(row.scrollIntoView).toHaveBeenCalled())
  row.remove()
})
