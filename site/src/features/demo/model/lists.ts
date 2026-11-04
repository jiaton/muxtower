import { DEVICES, type Device, type Session, type World } from './world'

export interface DeviceGroup {
  device: Device
  sessions: Session[]
}

/** The sessions the hub lists, by machine (the hub first), each fork or side chat right under its parent. */
export function groupsByDevice(world: World): DeviceGroup[] {
  const shown = world.sessions.filter((s) => !s.hidden)
  const ordered = shown.filter((s) => !s.parent).flatMap((s) => [s, ...shown.filter((c) => c.parent === s.id)])
  return DEVICES.map((device) => ({ device, sessions: ordered.filter((s) => s.device === device.id) })).filter((g) => g.sessions.length > 0)
}

/** How many sessions each view in the sidebar shows. */
export function counts(world: World) {
  const shown = world.sessions.filter((s) => !s.hidden)
  return {
    all: shown.length,
    needs: shown.filter((s) => s.state === 'permission').length,
    unread: shown.filter((s) => s.state === 'unread').length,
    working: shown.filter((s) => s.state === 'working').length,
  }
}

export const sessionsOn = (world: World, device: Device['id']) => world.sessions.filter((s) => !s.hidden && s.device === device)
