import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it } from 'vitest'
import { Button } from './button'
import { Dialog, DialogContent } from './dialog'
import { SuggestInput } from './suggest-input'

function Editing() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('saved')
  const [draft, setDraft] = useState(name)
  return (
    <>
      <Button onClick={() => (setDraft(name), setOpen(true))}>Rename</Button>
      <p>Name: {name}</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Rename">
          <SuggestInput
            aria-label="Name"
            value={draft}
            onValueChange={setDraft}
            suggestions={[{ value: 'saved one' }, { value: 'saved two' }]}
          />
          <Button onClick={() => (setName(draft), setOpen(false))}>Save</Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

it('Esc closes a list open inside a dialog first, then the dialog, its edits dropped', () => {
  render(<Editing />)
  const opener = screen.getByRole('button', { name: 'Rename' })
  opener.focus()
  fireEvent.click(opener)
  const field = screen.getByRole('combobox', { name: 'Name' })
  field.focus()
  fireEvent.change(field, { target: { value: 'saved t' } })
  expect(field).toHaveAttribute('aria-expanded', 'true')

  fireEvent.keyDown(field, { key: 'Escape' }) // the list
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(field).toHaveAttribute('aria-expanded', 'false')

  fireEvent.keyDown(field, { key: 'Escape' }) // the dialog
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Name: saved')).toBeInTheDocument() // nothing kept
})

it('puts a title icon before the title, the dialog still named by the title alone', () => {
  render(
    <Dialog open>
      <DialogContent title="Team · acme/billing" titleIcon={<span aria-hidden data-testid="dot" />} description="billing lead">
        <p>Body</p>
      </DialogContent>
    </Dialog>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Team · acme/billing' })
  expect(screen.getByRole('heading', { name: 'Team · acme/billing' }).firstElementChild).toBe(screen.getByTestId('dot'))
  expect(dialog).toHaveAccessibleDescription('billing lead')
})
