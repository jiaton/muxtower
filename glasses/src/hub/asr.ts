import { unwrap, type HubClient } from './client'

/** Speech to text on the hub (its provider key never leaves it). */
export async function transcribe(client: HubClient, wav: Uint8Array<ArrayBuffer>): Promise<string> {
  const result = await client.POST('/v1/asr', {
    body: wav as unknown as string,
    bodySerializer: (body: unknown) => body as BodyInit,
    headers: { 'Content-Type': 'audio/wav' },
  })
  return unwrap(result).text
}
