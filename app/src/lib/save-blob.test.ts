import { afterEach, expect, it, vi } from 'vitest'
import { saveBlob } from './save-blob'

afterEach(() => vi.useRealTimers())

it('downloads under its name, re-typed so it is never rendered, and gives the URL back', async () => {
  vi.useFakeTimers()
  let made: Blob | undefined
  URL.createObjectURL = vi.fn((b: Blob) => ((made = b), 'blob:saved'))
  URL.revokeObjectURL = vi.fn()
  const clicked: { href: string; download: string }[] = []
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download })
  })
  saveBlob(new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'diagram.svg')
  expect(made?.type).toBe('application/octet-stream')
  expect(clicked).toEqual([{ href: 'blob:saved', download: 'diagram.svg' }])
  expect(document.querySelector('a')).toBeNull() // the link was only for the click
  vi.runAllTimers()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:saved')
  click.mockRestore()
})
