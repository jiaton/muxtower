/** The demo build's entry (`npm run build:demo`): the real app against a daemon simulated in the page,
 *  for the project's site. Nothing a reader does leaves the browser. */
import './reset'
import { installDemo } from './install'

installDemo()
void import('../main')
