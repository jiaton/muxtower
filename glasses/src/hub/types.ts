import type { components } from './schema'

type Schemas = components['schemas']
export type Session = Schemas['Session']
export type AgentState = Schemas['AgentState']
export type PendingAction = Schemas['PendingAction']
export type ConversationItem = Schemas['ConversationItem']
export type StreamSubscribe = Schemas['StreamSubscribe']
export type ServerFrame = Schemas['StreamSchema']['server']
