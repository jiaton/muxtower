import type { components } from './schema'

type Schemas = components['schemas']
export type Session = Schemas['Session']
export type AgentState = Schemas['AgentState']
export type PendingAction = Schemas['PendingAction']
export type PendingQuestion = Schemas['PendingQuestion']
export type ConversationItem = Schemas['ConversationItem']
// What it sends: `encoding` may be left out (whole screens).
export type StreamSubscribe = Omit<Schemas['StreamSubscribe'], 'encoding'> & { encoding?: Schemas['StreamSubscribe']['encoding'] }
export type ServerFrame = Schemas['StreamSchema']['server']
