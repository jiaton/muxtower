import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { FileCard } from './file-card'

it('names the file, says its detail and offers its action', () => {
  render(<FileCard name="release-notes.pdf" head="release-" tail="notes.pdf" detail="48 KB" action={<button>Download</button>} />)
  const card = screen.getByRole('group', { name: 'release-notes.pdf' })
  expect(card).toHaveTextContent('release-notes.pdf')
  expect(card).toHaveTextContent('48 KB')
  expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
})

it('a file that is gone says so, and offers nothing', () => {
  render(<FileCard name="build.log" head="" tail="build.log" detail="Expired" action={<button>Download</button>} gone />)
  expect(screen.getByRole('group', { name: 'build.log' })).toHaveAttribute('data-gone')
  expect(screen.getByText('Expired')).toBeInTheDocument()
  expect(screen.queryByRole('button')).toBeNull()
})
