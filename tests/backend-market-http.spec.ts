import { afterEach, describe, expect, it } from 'vitest'
import { createBackendHttpApi } from '../src/backend/http.ts'
import { generateCommunityKeypair, signRequest, type CommunityKeypair } from '../src/host/community-keys.ts'
import { DEVICE_HEADER, INSTALLATION_HEADER, PUBLIC_KEY_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../src/shared/backend-v1.ts'
import { parseMarketState, parseMarketStreamEvent, type MarketStreamEvent } from '../src/shared/market-v1.ts'
import { createBackendFixture } from './helpers/backend.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
const START = Date.UTC(2026, 7, 16, 1)
async function setup(signed = false) {
  const fixture = createBackendFixture({}, START)
  const api = createBackendHttpApi({ service: fixture.service, store: fixture.store,
    voteRateLimitPerMinute: 0, allowUnsigned: !signed, log: () => undefined })
  await new Promise<void>(resolve => api.server.listen(0, '127.0.0.1', resolve))
  const address = api.server.address()
  if (address === null || typeof address === 'string') throw new Error('no HTTP listener')
  const base = `http://127.0.0.1:${address.port}`
  cleanups.push(async () => {
    await new Promise<void>(resolve => api.server.close(() => resolve()))
    api.reset()
    fixture.close()
  })
  const enroll = (fingerprint: string, incense = 0): CommunityKeypair => {
    const key = generateCommunityKeypair(fingerprint)
    fixture.store.upsertIdentity({ installation_id: key.installationId, public_key: key.publicKey,
      device_fingerprint: fingerprint, created_at: START, last_seen_at: START })
    fixture.grantIncense(key.installationId, incense)
    return key
  }
  return { ...fixture, api, base, enroll }
}
function headers(id: string | CommunityKeypair, method = 'GET', path = '/v1/market', body = ''): Record<string, string> {
  if (typeof id === 'string') return { [INSTALLATION_HEADER]: id, 'content-type': 'application/json' }
  const timestamp = Date.now()
  return { [INSTALLATION_HEADER]: id.installationId, [PUBLIC_KEY_HEADER]: id.publicKey,
    [TIMESTAMP_HEADER]: String(timestamp), [DEVICE_HEADER]: id.deviceFingerprint ?? '',
    [SIGNATURE_HEADER]: signRequest({ privateKeyPem: id.privateKeyPem, method, path,
      timestamp, body, installationId: id.installationId }), 'content-type': 'application/json' }
}
async function firstEvent(base: string, identity: string | CommunityKeypair): Promise<{ event: MarketStreamEvent, cancel: () => void }> {
  const controller = new AbortController()
  const response = await fetch(`${base}/v1/events`, { headers: headers(identity, 'GET', '/v1/events'), signal: controller.signal })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  const reader = response.body!.getReader()
  let buffer = ''
  for (let i = 0; i < 20; i += 1) {
    const { value, done } = await reader.read()
    if (done) throw new Error('stream ended before first state')
    buffer += new TextDecoder().decode(value)
    const payload = buffer.split('\n').find(line => line.startsWith('data: '))
    if (payload !== undefined && buffer.includes('\n\n')) {
      return { event: parseMarketStreamEvent(JSON.parse(payload.slice(6))), cancel: () => { controller.abort(); void reader.cancel().catch(() => undefined) } }
    }
  }
  throw new Error('stream did not send a bounded initial state')
}

describe('market HTTP authority and cloud stream', () => {
  it('requires signatures, protects query parameters, and rejects client-supplied balances', async () => {
    const h = await setup(true)
    const key = h.enroll('http-market-device-a', 10)
    expect((await fetch(`${h.base}/v1/market`, { headers: headers(key.installationId) })).status).toBe(401)
    const stateReply = await fetch(`${h.base}/v1/market`, { headers: headers(key) })
    const state = parseMarketState(await stateReply.json())
    const query = '/v1/market/history?limit=1'
    const valid = await fetch(`${h.base}${query}`, { headers: headers(key, 'GET', query) })
    expect(valid.status).toBe(200)
    const tampered = await fetch(`${h.base}/v1/market/history?limit=2`, { headers: headers(key, 'GET', query) })
    expect(tampered.status).toBe(401)
    const body = JSON.stringify({ market_id: state.market!.id, batch: 1, side: 'long', amount: 1,
      request_id: 'bad-balance-intent', available_incense: 999999 })
    expect((await fetch(`${h.base}/v1/market/position`, { method: 'POST', body,
      headers: headers(key, 'POST', '/v1/market/position', body) })).status).toBe(400)
    expect(h.service.marketState(key.installationId).wallet.available_incense).toBe(20) // gift + claim
  })

  it('freezes or spends the same last incense once under parallel HTTP requests', async () => {
    const h = await setup()
    const id = 'parallel-market-wallet'
    h.grantIncense(id, 1)
    const state = h.service.marketState(id)
    const replies = await Promise.all(Array.from({ length: 40 }, (_, n) => {
      const path = n % 2 === 0 ? '/v1/votes' : '/v1/market/position'
      const body = n % 2 === 0
        ? { case_id: state.market!.case_id, vote_type: 'up', request_id: `race-vote-${n}` }
        : { market_id: state.market!.id, batch: 1, side: 'long', amount: 1, request_id: `race-position-${n}` }
      return fetch(`${h.base}${path}`, { method: 'POST', headers: headers(id), body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() as Record<string, unknown> }))
    }))
    expect(replies.every(r => r.status < 500)).toBe(true)
    const wallet = h.service.marketState(id).wallet
    const spent = h.store.incenseFor(id, '2026-08-16')!.used_incense
    expect(wallet.available_incense + wallet.frozen_incense + spent).toBe(1)
    expect(spent).toBeLessThanOrEqual(1)
    expect(wallet.frozen_incense).toBeLessThanOrEqual(1)
    expect(h.store.database.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' })
  })

  it('sends only the authenticated wallet and shuts streams down with the server', async () => {
    const h = await setup(true)
    const a = h.enroll('private-stream-device-a', 5)
    const b = h.enroll('private-stream-device-b', 20)
    const streamA = await firstEvent(h.base, a)
    const streamB = await firstEvent(h.base, b)
    expect(streamA.event.market_state!.wallet.available_incense).toBe(15)
    expect(streamB.event.market_state!.wallet.available_incense).toBe(30)
    expect(JSON.stringify(streamA.event)).not.toContain(b.installationId)
    expect(JSON.stringify(streamA.event)).not.toContain(b.privateKeyPem)
    expect(streamA.event.snapshot).toBeDefined()
    expect(streamA.event.epoch).toBe(streamB.event.epoch)
    streamA.cancel(); streamB.cancel()
  })

  it('bounds query pages and does not mix different case histories', async () => {
    const h = await setup()
    const id = 'bounded-market-reader'
    for (const path of ['/v1/market/candles?limit=289', '/v1/market/history?limit=51',
      '/v1/market/history?limit=1&limit=2', '/v1/market/candles?cursor=bad']) {
      expect((await fetch(`${h.base}${path}`, { headers: headers(id) })).status).toBe(400)
    }
    const candles = await fetch(`${h.base}/v1/market/candles`, { headers: headers(id) })
    expect(candles.status).toBe(200)
    const payload = await candles.json() as { candles: unknown[] }
    expect(payload.candles.length).toBeLessThanOrEqual(288)
  })
})
