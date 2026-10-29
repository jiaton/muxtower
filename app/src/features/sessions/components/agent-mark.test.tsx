import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AgentMark, agentIcon } from './agent-mark'

it('names the agent, unless its name is written beside it', () => {
  const { container } = render(
    <>
      <AgentMark agent="Codex" />
      <AgentMark agent="Claude Code" decorative />
    </>,
  )
  expect(screen.getByRole('img', { name: 'Codex' })).toHaveAttribute('title', 'Codex')
  expect(screen.queryByRole('img', { name: 'Claude Code' })).toBeNull()
  expect(container.querySelectorAll('svg')).toHaveLength(2)
})

it('gives each agent its own shape, and an agent it does not know a generic one', () => {
  expect(agentIcon('Codex')).not.toBe(agentIcon('Claude Code'))
  expect(agentIcon('aider')).toBe(agentIcon('something else'))
})
