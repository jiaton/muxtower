import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiClients } from './api-clients'

describe('ApiClients', () => {
  it('shows the calls a client makes and what to build', () => {
    render(<ApiClients />)
    expect(screen.getByText(/v1\/sessions\/5b9f2e81c044\/approve/)).toBeInTheDocument()
    expect(screen.getByText('Home Assistant')).toBeInTheDocument()
  })
})
