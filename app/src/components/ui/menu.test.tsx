import { fireEvent, render, screen } from '@testing-library/react'
import { Pencil } from 'lucide-react'
import { afterEach, expect, it } from 'vitest'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'
import { Truncated } from './truncated'

const real = window.matchMedia
afterEach(() => {
  window.matchMedia = real
})

function Menu() {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem icon={Pencil} shortcut="t" detail="worker — the billing page and its tests">
          Team…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

it('shows an item’s key as an uppercase keycap, its role as a second line, and a box no wider than 20rem', () => {
  render(<Menu />)
  const item = screen.getByRole('menuitem', { name: /Team/ })
  expect(item.querySelector('kbd')?.textContent).toBe('T')
  expect(item).toHaveTextContent('worker — the billing page and its tests')
  expect(screen.getByRole('menu').className).toContain('max-w-[min(20rem,calc(100vw-16px))]')
  expect(screen.getByRole('menu')).not.toHaveAttribute('data-sheet')
})

it('opens as a sheet from the bottom on a phone, where keys are not shown', () => {
  window.matchMedia = ((query: string) => ({
    matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia // prettier-ignore
  render(<Menu />)
  const menu = screen.getByRole('menu')
  expect(menu).toHaveAttribute('data-sheet')
  expect(menu.className).toContain('[&_[data-hint]]:hidden')
})

it('shows the whole text at once when it is cut, and only then', () => {
  const { rerender } = render(<Truncated>a long role</Truncated>)
  const text = screen.getByText('a long role')
  fireEvent.pointerEnter(text)
  expect(screen.queryByRole('tooltip')).toBeNull() // it fits (jsdom lays nothing out: no overflow)
  fireEvent.pointerLeave(text)
  Object.defineProperty(text, 'scrollWidth', { value: 400, configurable: true })
  Object.defineProperty(text, 'clientWidth', { value: 120, configurable: true })
  rerender(<Truncated>a long role</Truncated>)
  fireEvent.pointerEnter(text)
  expect(screen.getByRole('tooltip')).toHaveTextContent('a long role')
  fireEvent.pointerLeave(text)
  expect(screen.queryByRole('tooltip')).toBeNull()
})
