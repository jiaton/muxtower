import * as Menu from '@radix-ui/react-dropdown-menu'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { PROJECT_HUES, ProjectHuePicker, ProjectIcon, ProjectTag, hueName } from './project-hue'

it('tints a tag with its hue, and leaves it neutral without one', () => {
  render(
    <>
      <ProjectTag hue={4}>acme/web</ProjectTag>
      <ProjectTag hue={null}>acme/api</ProjectTag>
    </>,
  )
  const tinted = screen.getByText('acme/web')
  expect(tinted).toHaveAttribute('data-hue', '4')
  expect(tinted.className).toContain('bg-project-4-soft')
  expect(tinted.className).toContain('text-project-4-ink')
  const plain = screen.getByText('acme/api')
  expect(plain).not.toHaveAttribute('data-hue')
  expect(plain.className).not.toMatch(/project-/)
})

it("shows a project's dot in an icon's place, the project icon while it has no hue", () => {
  const { container } = render(
    <>
      <ProjectIcon hue={2} />
      <ProjectIcon hue={null} />
    </>,
  )
  expect(container.querySelector('[data-hue="2"]')?.className).toContain('bg-project-2')
  expect(container.querySelectorAll('svg')).toHaveLength(1) // the neutral one: lucide's folder
})

it('names the six hues, none a state', () => {
  expect(PROJECT_HUES.map((h) => h.name)).toEqual(['Rose', 'Teal', 'Ochre', 'Mauve', 'Moss', 'Clay'])
  expect(hueName(3)).toBe('Ochre')
  expect(hueName(null)).toBeNull()
})

function Open({ hue, onPick }: { hue: number | null; onPick: (hue: number) => void }) {
  return (
    <Menu.Root open modal={false}>
      <Menu.Trigger>More</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content>
          <ProjectHuePicker hue={hue} onPick={onPick} />
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

it('offers the six hues as a radio group, the current one checked; a click picks one', () => {
  const onPick = vi.fn()
  render(<Open hue={2} onPick={onPick} />)
  const group = screen.getByRole('group', { name: 'Colour' })
  const swatches = within(group).getAllByRole('menuitemradio')
  expect(swatches.map((s) => s.getAttribute('aria-label'))).toEqual(['Rose', 'Teal', 'Ochre', 'Mauve', 'Moss', 'Clay'])
  expect(swatches.map((s) => s.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false'])
  fireEvent.click(within(group).getByRole('menuitemradio', { name: 'Moss' }))
  expect(onPick).toHaveBeenCalledWith(5)
})

it('moves between the swatches with left and right, round the row', () => {
  render(<Open hue={null} onPick={() => {}} />)
  const [rose, teal, , , , clay] = screen.getAllByRole('menuitemradio')
  rose!.focus()
  fireEvent.keyDown(rose!, { key: 'ArrowRight' })
  expect(document.activeElement).toBe(teal)
  fireEvent.keyDown(teal!, { key: 'ArrowLeft' })
  fireEvent.keyDown(rose!, { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(clay)
  expect(screen.getAllByRole('menuitemradio').every((s) => s.getAttribute('aria-checked') === 'false')).toBe(true) // none stored: none marked
})
