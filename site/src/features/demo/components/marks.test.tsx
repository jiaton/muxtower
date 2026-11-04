import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentMark, SOURCE_LABEL, StateMark, stateLabel } from './marks'

describe('marks', () => {
  it('labels states and agents for assistive tech', () => {
    render(
      <>
        <StateMark state="permission" />
        <AgentMark agent="codex" />
      </>,
    )
    expect(screen.getByRole('img', { name: 'Needs approval' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Codex' })).toBeInTheDocument()
    expect(stateLabel('unread')).toBe('Finished, unread')
    expect(SOURCE_LABEL.desktop).toBe('Claude desktop')
  })
})
