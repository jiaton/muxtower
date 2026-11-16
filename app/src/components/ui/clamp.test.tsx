import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Clamp } from './clamp'

// jsdom draws nothing: a text's height is made up from its line count, 20px a line, clamped at 8.
const LINE = 20
function heights() {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return (this.textContent ?? '').split('\n').length * LINE
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    const full = (this.textContent ?? '').split('\n').length * LINE
    return this.style.maxHeight ? Math.min(full, 8 * LINE) : full
  })
}
afterEach(() => vi.restoreAllMocks())

it('leaves a short message as it is', () => {
  heights()
  render(<Clamp>one line</Clamp>)
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText('one line')).not.toHaveAttribute('data-clamped')
})

it('cuts a long message at eight lines, with Show more and Show less', () => {
  heights()
  const text = [...Array(20)].map((_, i) => `line ${i}`).join('\n')
  render(<Clamp>{text}</Clamp>)
  const body = screen.getByText(/line 0/)
  expect(body).toHaveAttribute('data-clamped')
  expect(body.style.maxHeight).toBe('8lh')
  expect(body).toHaveTextContent('line 19') // all of it is in the page: copy and find see it
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
  expect(body).not.toHaveAttribute('data-clamped')
  expect(body.style.maxHeight).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
  expect(body).toHaveAttribute('data-clamped')
})

it('measures CJK by how tall it is drawn, not by its characters', () => {
  heights()
  const short = '这是一段不长的中文消息'.repeat(3) // many characters, one line
  const { unmount } = render(<Clamp>{short}</Clamp>)
  expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  unmount()
  render(<Clamp>{[...Array(12)].map(() => '第一行文字').join('\n')}</Clamp>)
  expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
})

it('opens when find in page scrolls into the cut-off part', () => {
  heights()
  render(<Clamp>{[...Array(20)].map((_, i) => `line ${i}`).join('\n')}</Clamp>)
  const body = screen.getByText(/line 0/)
  act(() => {
    body.scrollTop = 120
    body.dispatchEvent(new Event('scroll'))
  })
  expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
})
