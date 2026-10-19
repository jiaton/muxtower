import { MenuItemClickEvent, Sys_ItemEvent, Text_ItemEvent, IMU_Report_Data } from '@evenrealities/even_hub_sdk'
import { expect, it } from 'vitest'
import { readEvent, toAction } from './gestures'

it('reads swipes, taps without a type, menus and lifecycle', () => {
  expect(readEvent({ textEvent: new Text_ItemEvent({ eventType: 1 }) })).toEqual({ gesture: 'up' })
  expect(readEvent({ textEvent: new Text_ItemEvent({ eventType: 2 }) })).toEqual({ gesture: 'down' })
  expect(readEvent({ sysEvent: new Sys_ItemEvent({}) })).toEqual({ gesture: 'tap' })
  expect(readEvent({ sysEvent: new Sys_ItemEvent({ eventType: 3 }) })).toEqual({ gesture: 'double' })
  expect(readEvent({ menuItemClickEvent: new MenuItemClickEvent({ itemID: 4 }) })).toEqual({ menu: 4 })
  expect(readEvent({ sysEvent: new Sys_ItemEvent({ eventType: 4 }) })).toEqual({ lifecycle: 'covered' })
  expect(readEvent({ sysEvent: new Sys_ItemEvent({ eventType: 8, imuData: new IMU_Report_Data({ x: 1 }) }) })).toBeNull()
})

it('maps gestures through a remappable table', () => {
  expect(toAction('double')).toBe('back')
  expect(toAction('up', { up: 'down', down: 'up', tap: 'select', double: 'back', long: null, longEnd: null })).toBe('down')
})
