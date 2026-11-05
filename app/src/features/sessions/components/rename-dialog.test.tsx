import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { Session } from '@/lib/api/types'
import { addDaemon, wrapper } from '@/test/render'
import { RenameDialog } from './rename-dialog'

it('offers the name the agent gives the session, and takes it with one tap', () => {
  const daemon = addDaemon()
  const session = { id: 's1', name: 'Release worker', agent_name: 'Fix the build', runtime: 'claude-code' } as Session
  const Wrapper = wrapper()
  render(
    <Wrapper>
      <RenameDialog daemonId={daemon.id} session={session} onClose={() => {}} />
    </Wrapper>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Claude Code calls it Fix the build/ }))
  expect(screen.getByRole('textbox', { name: 'Session name' })).toHaveValue('Fix the build')
  expect(screen.queryByRole('button', { name: /calls it/ })).toBeNull() // that is what is typed now
})
