import type { components } from './schema'

type Schemas = components['schemas']
export type Session = Schemas['Session']
export type AgentState = Schemas['AgentState']
export type PendingAction = Schemas['PendingAction']
export type Option = Schemas['Option']
export type RuntimeInfo = Schemas['RuntimeInfo']
export type Device = Schemas['Device']
export type ClaimResult = Schemas['ClaimResult']
export type StreamSubscribe = Schemas['StreamSubscribe']
export type ServerFrame = Schemas['SessionsFrame'] | Schemas['ScreenFrame'] | Schemas['ErrorFrame']
