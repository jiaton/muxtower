import { renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { wrapper } from '@/test/render'
import { fakeHub, item } from '../test/hub'
import {
  InboxConflictError,
  useAddInboxItem,
  useDeleteInboxItem,
  useDoneItems,
  useHandInboxItem,
  useInbox,
  usePatchInboxItem,
  useReorderInbox,
} from './use-inbox'

function hooks() {
  return renderHook(
    () => ({
      inbox: useInbox(),
      done: useDoneItems(true),
      add: useAddInboxItem(),
      patch: usePatchInboxItem(),
      remove: useDeleteInboxItem(),
      reorder: useReorderInbox(),
      hand: useHandInboxItem(),
    }),
    { wrapper: wrapper() },
  )
}

it('reads the open items and, asked for, the done ones', async () => {
  const hub = fakeHub([item(1, 'Plan the launch')])
  hub.done = [item(2, 'Ship the beta', { status: 'done' })]
  const { result } = hooks()
  await waitFor(() => expect(result.current.inbox.data?.map((i) => i.text)).toEqual(['Plan the launch']))
  await waitFor(() => expect(result.current.done.data?.map((i) => i.text)).toEqual(['Ship the beta']))
})

it('adds first in the list', async () => {
  fakeHub([item(1, 'Plan the launch')])
  const { result } = hooks()
  await waitFor(() => expect(result.current.inbox.data).toHaveLength(1))
  result.current.add.mutate({ text: 'Tidy the docs' })
  await waitFor(() => expect(result.current.inbox.data?.map((i) => i.text)).toEqual(['Tidy the docs', 'Plan the launch']))
})

it('a patch sends if_version; a stale one fails with the item as it is now, put in the list', async () => {
  const hub = fakeHub([item(1, 'Plan the launch')])
  const { result } = hooks()
  await waitFor(() => expect(result.current.inbox.data).toHaveLength(1))
  const read = result.current.inbox.data![0]!
  hub.elsewhere(1, { text: 'Plan the launch for May' })
  result.current.patch.mutate({ item: read, patch: { text: 'Mine' } })
  await waitFor(() => expect(result.current.patch.error).toBeInstanceOf(InboxConflictError))
  expect((result.current.patch.error as InboxConflictError).current.text).toBe('Plan the launch for May')
  expect(result.current.inbox.data![0]!.text).toBe('Plan the launch for May')
  expect(hub.patches()[0]!.body).toEqual({ text: 'Mine', if_version: 1 })
})

it('a reorder shows at once and takes the hub’s answer, whose versions the next change sends', async () => {
  const hub = fakeHub([item(1, 'Alpha'), item(2, 'Bravo')])
  const { result } = hooks()
  await waitFor(() => expect(result.current.inbox.data).toHaveLength(2))
  hub.elsewhere(1, {}) // the hub bumps a moved item's version
  result.current.reorder.mutate([2, 1])
  await waitFor(() => expect(result.current.reorder.isSuccess).toBe(true))
  expect(result.current.inbox.data?.map((i) => i.text)).toEqual(['Bravo', 'Alpha'])
  result.current.patch.mutate({ item: result.current.inbox.data![1]!, patch: { status: 'done' } })
  await waitFor(() => expect(result.current.patch.isSuccess).toBe(true))
  expect(hub.patches()[0]!.body).toEqual({ status: 'done', if_version: 2 })
})

it('deletes, and hands (refused: the hub’s reason is the error)', async () => {
  const hub = fakeHub([item(1, 'Alpha'), item(2, 'Bravo')])
  const { result } = hooks()
  await waitFor(() => expect(result.current.inbox.data).toHaveLength(2))
  result.current.remove.mutate(result.current.inbox.data![0]!)
  await waitFor(() => expect(result.current.inbox.data?.map((i) => i.text)).toEqual(['Bravo']))
  hub.refuseHand = 'No one in acme/web holds the role lead'
  result.current.hand.mutate({ item: result.current.inbox.data![0]!, target: { project: 'acme/web', role: 'lead' } })
  await waitFor(() => expect(result.current.hand.error?.message).toBe('No one in acme/web holds the role lead'))
  hub.refuseHand = null
  result.current.hand.mutate({ item: result.current.inbox.data![0]!, target: { project: 'acme/web', role: 'lead' } })
  await waitFor(() => expect(result.current.inbox.data![0]!.status).toBe('handed'))
})
