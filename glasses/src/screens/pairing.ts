import { TEXT_WIDTH } from '@/display/limits'
import type { Screen } from '@/display/screen'
import { wrap } from '@/display/text'

export function pairingView(revoked: boolean): Screen {
  const lead = revoked ? 'This device was unpaired.' : 'Not paired yet.'
  const how = 'On your phone, open muxtower in the Even App and enter a pairing code from `muxtower pair` or the web app.'
  return { header: 'muxtower', body: [lead, '', ...wrap(how, TEXT_WIDTH)], footer: 'waiting for a code…' }
}
