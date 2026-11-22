/**
 * Records of tapped notifications (`push-click.ts`) waiting to be posted. The service worker has no
 * device token, so it keeps each record here (IndexedDB, the one store both it and the app's pages
 * reach) and the app posts them: at its next start, and shortly after a click it was told of.
 */
import { idbRing } from './idb-ring'
import type { PushClickRecord } from './push-click'

const clicks = idbRing<PushClickRecord>('muxtower-push-clicks', 50) // the newest; older ones are dropped unposted

/** Keeps a record for the app to post; never throws. */
export const savePushClick = (record: PushClickRecord): Promise<void> => clicks.add(record)

/** Takes every kept record out (oldest first); never throws. */
export const takePushClicks = (): Promise<PushClickRecord[]> => clicks.take()
