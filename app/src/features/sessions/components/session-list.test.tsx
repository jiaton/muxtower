import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@/lib/api/types'
import type { Daemon } from '@/lib/daemons/types'
import type { SessionEntry } from '../model/facets'
import type { Group } from '../model/query'
import { useListPrefs, useNewSessionRequest } from '../store'
import { SessionList } from './session-list'
import { wrapper } from '@/test/render'

const drawn = vi.hoisted(() => ({ rows: [] as string[] }))
vi.mock('./session-list-row', () => ({
  SessionListRow: ({ entry }: { entry: SessionEntry }) => {
    drawn.rows.push(entry.session.name)
    return (
      <a href={`#${entry.key}`} data-row-link>
        {entry.session.name}
      </a>
    )
  },
}))

const daemon = { id: 'd1', name: 'hub', url: 'http://hub.test', token: 't' } as Daemon
const entry = (id: string, over: Partial<Session> = {}): SessionEntry => ({
  key: `d1/${id}`,
  daemon,
  session: {
    id,
    name: id,
    runtime: 'claude-code',
    source: 'launched',
    on_host: true,
    cwd: '/home/me',
    machine: 'hub',
    state: 'idle',
    needs_attention: false,
    ...over,
  } as Session,
})
const implies = { device: true, folder: false, source: false, account: false, agent: false }
const device = (entries: Record<string, SessionEntry[]>): Group => ({
  key: 'hub',
  label: 'hub',
  implies,
  entries: Object.values(entries).flat(),
  sections: Object.entries(entries).map(([key, list]) => ({ key, label: key, entries: list })),
})

beforeEach(() => {
  drawn.rows = []
  useListPrefs.setState({ collapsed: [] })
})

it('folds one folder without drawing any other row again, and draws again only a session that changed', () => {
  const acme = [entry('Acme onboarding'), entry('Acme pricing')]
  const notes = [entry('Weekly notes')]
  const { rerender } = render(<SessionList groups={[device({ '~/acme': acme, '~/notes': notes })]} foldScope="device" />, {
    wrapper: wrapper(),
  })
  expect(drawn.rows.sort()).toEqual(['Acme onboarding', 'Acme pricing', 'Weekly notes'])

  drawn.rows = []
  fireEvent.click(screen.getByRole('button', { name: /^acme/ }))
  expect(screen.queryByText('Acme pricing')).toBeNull()
  expect(drawn.rows).toEqual([]) // the folder's rows went, and no other row was drawn again

  drawn.rows = []
  const changed = { ...notes[0]!, session: { ...notes[0]!.session, state: 'busy' } as Session }
  rerender(<SessionList groups={[device({ '~/acme': acme, '~/notes': [changed] })]} foldScope="device" />)
  expect(drawn.rows).toEqual(['Weekly notes'])
})

it('counts a folded folder and says how many need you', () => {
  const acme = [entry('Acme onboarding', { needs_attention: true }), entry('Acme pricing')]
  render(<SessionList groups={[device({ '~/acme': acme })]} foldScope="device" />, { wrapper: wrapper() })
  fireEvent.click(screen.getByRole('button', { name: /^acme/ }))
  const header = screen.getByRole('button', { name: /^acme/ })
  expect(header).toHaveAttribute('aria-expanded', 'false')
  expect(header.textContent).toMatch(/1 need you\s*2/)
})

it('moves focus inside a folder that folds to its header', () => {
  const acme = [entry('Acme onboarding')]
  render(<SessionList groups={[device({ '~/acme': acme, '~/notes': [entry('Weekly notes')] })]} foldScope="device" />, {
    wrapper: wrapper(),
  })
  const inside = screen.getByText('Acme onboarding')
  inside.tabIndex = 0
  inside.focus()
  const header = screen.getByRole('button', { name: /^acme/ })
  fireEvent.click(header)
  expect(screen.queryByText('Acme onboarding')).toBeNull()
  expect(document.activeElement).toBe(header)
})

it('slides only a row that moved to another group; the rows that follow and the headers stay still', () => {
  const animated: string[] = []
  const animate = vi.fn(function (this: HTMLElement, frames: Keyframe[]) {
    animated.push(`${this.dataset.row ?? this.tagName}:${'transform' in frames[0]! ? 'move' : 'fade'}`)
    return { onfinish: null, oncancel: null } as unknown as Animation
  })
  const restore = [
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent'),
    HTMLElement.prototype.getBoundingClientRect,
  ] as const
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get: () => document.body })
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const rows = [...document.querySelectorAll('[data-row]')]
    return { top: rows.indexOf(this) * 50 } as DOMRect // each row 50 px below the one before
  }
  HTMLElement.prototype.animate = animate as never
  try {
    const flat = (key: string, entries: SessionEntry[]): Group => ({ key, label: key, implies, entries })
    const [a, b, c] = [entry('Acme onboarding'), entry('Acme pricing'), entry('Weekly notes')]
    const { rerender } = render(<SessionList groups={[flat('working', [a, b]), flat('idle', [c])]} />, { wrapper: wrapper() })
    rerender(<SessionList groups={[flat('working', [b]), flat('idle', [a, c])]} />) // Acme onboarding finished
    expect(animated).toEqual(['d1/Acme onboarding:move'])
  } finally {
    if (restore[0]) Object.defineProperty(HTMLElement.prototype, 'offsetParent', restore[0])
    HTMLElement.prototype.getBoundingClientRect = restore[1]
    delete (HTMLElement.prototype as { animate?: unknown }).animate
  }
})

it('a folder header and a device header start a new session there', () => {
  const acme = [entry('Acme onboarding', { cwd: '/home/me/acme' })]
  render(<SessionList groups={[device({ '~/acme': acme })]} foldScope="device" />, { wrapper: wrapper() })
  fireEvent.click(screen.getByRole('button', { name: 'New session in acme' }))
  expect(useNewSessionRequest.getState().preset).toEqual({ daemonId: 'd1', node: null, cwd: '/home/me/acme' })
  fireEvent.click(screen.getByRole('button', { name: 'New session in hub' }))
  expect(useNewSessionRequest.getState().preset).toEqual({ daemonId: 'd1', node: null, cwd: '' })
})

it('brings the open session’s row into view once each time it changes, the nearest way, and marks it', () => {
  const scrolled: string[] = []
  const was = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = function (this: Element, how?: boolean | ScrollIntoViewOptions) {
    expect(how).toEqual({ block: 'nearest' })
    scrolled.push(this.getAttribute('data-row') ?? '')
  }
  try {
    const groups = [device({ '~/acme': [entry('one'), entry('two')] })]
    const { rerender, container } = render(<SessionList groups={groups} selectedKey="d1/one" />, { wrapper: wrapper() })
    rerender(<SessionList groups={groups} selectedKey="d1/one" />) // drawn again: no second scroll
    rerender(<SessionList groups={groups} selectedKey="d1/two" />)
    expect(scrolled).toEqual(['d1/one', 'd1/two'])
    const marked = container.querySelector('[data-row="d1/two"]')!
    expect(marked.className).toContain('bg-accent-soft')
    expect(container.querySelector('[data-row="d1/one"]')!.className).not.toContain('bg-accent-soft')
  } finally {
    Element.prototype.scrollIntoView = was
  }
})

it('moves between rows with the up and down keys, from a focused row only', () => {
  const groups = [device({ '~/acme': [entry('one'), entry('two'), entry('three')] })]
  render(<SessionList groups={groups} />, { wrapper: wrapper() })
  const links = screen.getAllByRole('link')
  for (const link of links) Object.defineProperty(link, 'offsetParent', { get: () => document.body }) // drawn
  links[0]!.focus()
  fireEvent.keyDown(links[0]!, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(links[1])
  fireEvent.keyDown(links[1]!, { key: 'ArrowDown' })
  fireEvent.keyDown(links[2]!, { key: 'ArrowDown' }) // the last stays
  expect(document.activeElement).toBe(links[2])
  fireEvent.keyDown(links[2]!, { key: 'ArrowUp' })
  expect(document.activeElement).toBe(links[1])
})

it('a folder group says it is a folder, so one named like a project is never taken for it', () => {
  const group = (kind: 'project' | 'folder', id: string): Group => ({
    key: `${kind}:acme`,
    label: 'acme',
    kind,
    implies: { ...implies, device: false },
    entries: [entry(id)],
  })
  render(<SessionList groups={[group('project', 'p1'), group('folder', 'f1')]} foldScope="project" />, { wrapper: wrapper() })
  const [project, folder] = screen.getAllByRole('heading', { level: 3 })
  expect(project!.textContent).not.toMatch(/folder/)
  expect(folder!.textContent).toMatch(/^acme\/folder/)
})
