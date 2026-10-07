import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useDaemonsStore } from '@/lib/daemons/store'
import { DAEMON_URL } from './server'

export function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

export function addDaemon(token: string | null = 'good') {
  useDaemonsStore.setState({ daemons: [] })
  return useDaemonsStore.getState().add({ name: 'box', url: DAEMON_URL, token })
}
