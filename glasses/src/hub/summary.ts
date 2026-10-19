import type { HubClient } from './client'

/** Asks the hub for a short version of a session's last reply; it pushes the session again when ready. */
export async function requestSummary(client: HubClient, sessionId: string): Promise<void> {
  await client.POST('/v1/sessions/{session_id}/summary', { params: { path: { session_id: sessionId } } })
}
