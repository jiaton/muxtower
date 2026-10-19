/** Runs a screen's command against the hub; returns the footer line that reports it. */
import { HubError, unwrap, type HubClient } from '@/hub/client'
import type { Session } from '@/hub/types'
import type { Command } from '@/state/model'

export interface CommandEffects {
  sessions(list: Session[]): void
  reconnect(): void
  exit(): Promise<void>
  rejected(): void
}

export async function runCommand(client: HubClient, command: Command, effects: CommandEffects): Promise<string | null> {
  try {
    switch (command.type) {
      case 'approve': {
        const params = { path: { session_id: command.id } }
        const result = unwrap(await client.POST('/v1/sessions/{session_id}/approve', { params, body: { option: command.option } }))
        return result.option === 'deny' ? 'Denied' : 'Sent'
      }
      case 'deny':
        unwrap(await client.POST('/v1/sessions/{session_id}/deny', { params: { path: { session_id: command.id } } }))
        return 'Denied'
      case 'input': {
        const body = { text: command.text ?? null, key: command.key ?? null, enter: command.text !== undefined }
        unwrap(await client.POST('/v1/sessions/{session_id}/input', { params: { path: { session_id: command.id } }, body }))
        return command.key ? 'Interrupted' : 'Sent'
      }
      case 'refresh':
        effects.sessions(unwrap(await client.GET('/v1/sessions')))
        effects.reconnect()
        return 'Up to date'
      case 'exit':
        await effects.exit()
        return null
    }
  } catch (error) {
    if (error instanceof HubError && error.tokenRejected) effects.rejected()
    return error instanceof Error ? error.message : 'Something went wrong'
  }
}
