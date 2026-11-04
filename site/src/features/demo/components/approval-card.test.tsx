import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApprovalCard } from './approval-card'

describe('ApprovalCard', () => {
  it('shows the exact command and the dialog’s options, the recommended one marked', () => {
    const { container } = render(
      <ApprovalCard pending={{ tool: 'Bash', command: 'npm test', options: ['Yes', 'Yes, always', 'No'], recommended: 1 }} target="card" />,
    )
    expect(screen.getByText('npm test')).toBeInTheDocument()
    expect(container.querySelector('[data-demo="card-option-1"]')).toHaveTextContent('Yes, always')
    expect(screen.getByRole('button', { name: /Deny/ })).toBeInTheDocument()
  })
})
