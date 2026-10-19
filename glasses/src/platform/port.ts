import type { EvenHubEvent } from '@evenrealities/even_hub_sdk'

export interface MenuItem {
  id: number
  name: string
}

/** What the app needs from the glasses and the Even App. The SDK bridge implements it on a phone; a DOM
 *  preview implements it in a plain browser (development, tests). Nothing else imports the SDK. */
export interface GlassesPort {
  /** Creates the page: one full-screen text container that receives input, plus the system menu. */
  create(text: string, menu: MenuItem[]): Promise<boolean>
  /** Replaces the text without rebuilding the page (no flicker). */
  update(text: string): Promise<boolean>
  onEvent(listener: (event: EvenHubEvent) => void): () => void
  /** Storage kept by the Even App for this app (survives relaunches). */
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  /** Leave the app (the system asks first). */
  exit(): Promise<void>
}
