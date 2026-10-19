import { expect, it } from 'vitest'
import { parseHubConfig } from './config'
import { streamUrl } from './stream'

it('defaults to the page origin and keeps only string gate values', () => {
  expect(parseHubConfig(null, 'https://hub.example')).toEqual({ url: 'https://hub.example', gate: { headers: {}, query: {} } })
  const config = parseHubConfig(
    { hub: 'https://hub.example/', gate: { headers: { 'X-Gate-Token': 'g', bad: 1 }, query: { gate_token: 'g' } } },
    'https://other.example',
  )
  expect(config).toEqual({ url: 'https://hub.example', gate: { headers: { 'X-Gate-Token': 'g' }, query: { gate_token: 'g' } } })
})

it('puts only the gate credential in the stream URL, never the device token', () => {
  const url = streamUrl(parseHubConfig({ hub: 'https://hub.example', gate: { query: { gate_token: 'g' } } }, ''))
  expect(url).toBe('wss://hub.example/v1/stream?gate_token=g')
  expect(streamUrl(parseHubConfig(null, 'http://127.0.0.1:5173'))).toBe('ws://127.0.0.1:5173/v1/stream')
})
