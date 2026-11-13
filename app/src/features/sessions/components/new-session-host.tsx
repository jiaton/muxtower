import { useNewSessionRequest } from '../store'
import { NewSessionDialog } from './new-session-dialog'

/** The new-session dialog for a request made elsewhere (`useNewSessionRequest`: "New session here" on a
 *  session, a list header's +), mounted once with the app's shell. */
export function NewSessionHost() {
  const { preset, n, close } = useNewSessionRequest()
  return preset ? <NewSessionDialog key={n} open preset={preset} onOpenChange={(open) => open || close()} /> : null
}
