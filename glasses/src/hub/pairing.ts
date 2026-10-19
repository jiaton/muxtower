import { unwrap, type HubClient } from './client'

export const DEVICE_NAME = 'G2 glasses'

/** Redeems a one-time pairing code (from `muxtower pair` or the web app) for this device's token. */
export async function claim(client: HubClient, code: string, deviceName?: string) {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, '')
  return unwrap(await client.POST('/v1/pair/claim', { body: { code: normalized, device_name: deviceName?.trim() || DEVICE_NAME } }))
}
