import { setupServer } from 'msw/node'

export const DAEMON_URL = 'http://daemon.test'
export const server = setupServer()
