import { afterEach, expect, it, vi } from 'vitest'
import { createBackendFixture, type BackendFixture } from './helpers/backend.ts'
const fixtures: BackendFixture[] = []
afterEach(() => { vi.restoreAllMocks(); for (const f of fixtures.splice(0)) f.close() })
function fixture() {
  const f = createBackendFixture({}, Date.UTC(2026, 7, 16, 1))
  fixtures.push(f)
  f.grantIncense('stream-owner-a', 100)
  f.grantIncense('stream-owner-b', 100)
  return f
}

it('shares public pools while preserving private positions and refreshing same-amount direction changes', () => {
  const f = fixture(), a = 'stream-owner-a', b = 'stream-owner-b'
  const market = f.service.marketState(a).market!
  const order = (id: string, side: 'long' | 'short', request_id: string) => f.service.setMarketPosition(id,
    { market_id: market.id, batch: 1, side, amount: 10, request_id })
  expect(order(a, 'long', 'frame-a').accepted).toBe(true)
  expect(order(b, 'short', 'frame-b').accepted).toBe(true)
  const frame = f.service.prepareMarketStreamFrame()
  const previous = frame(a)
  expect(frame(b, previous).market?.batches[0]?.position?.side).toBe('short')
  expect(order(b, 'long', 'frame-b-switch').accepted).toBe(true)
  const updated = f.service.prepareMarketStreamFrame()(a, previous)
  expect(updated.market?.batches[0]).toMatchObject({ long_incense: 20, short_incense: 0, position: { side: 'long', amount: 10 } })
  expect(updated.wallet).toEqual(previous.wallet)
  expect(order(a, 'short', 'frame-a-switch').accepted).toBe(true)
  expect(f.service.prepareMarketStreamFrame()(a, updated).market?.batches[0]?.position?.side).toBe('short')
})

it('does not recompile per-subscriber SQL or write unchanged private ledgers during a fanout', () => {
  const f = fixture(), id = 'stream-owner-a'
  let previous = f.service.prepareMarketStreamFrame()(id)
  const frame = f.service.prepareMarketStreamFrame()
  const prepare = vi.spyOn(f.store.database, 'prepare')
  const changes = f.store.database.prepare('SELECT total_changes() AS n')
  const before = changes.get()!.n
  prepare.mockClear()
  for (let n = 0; n < 1000; n += 1) previous = frame(id, previous)
  expect(prepare).not.toHaveBeenCalled()
  expect(changes.get()!.n).toBe(before)
  expect(previous.wallet.available_incense).toBe(100)
})

it('grants a continuously connected account its next-day gift once and discards old private positions', () => {
  const f = fixture(), id = 'stream-gift-owner'
  f.store.upsertIdentity({ installation_id: id, public_key: 'stream-gift-key', device_fingerprint: 'stream-gift-device',
    created_at: f.clock.now(), last_seen_at: f.clock.now() })
  const previous = f.service.marketState(id)
  expect(previous.wallet.available_incense).toBe(10)
  f.clock.advance(24 * 60 * 60 * 1000)
  f.service.tick()
  const frame = f.service.prepareMarketStreamFrame()
  const current = frame(id, previous)
  expect(current.market?.business_date).toBe('2026-08-17')
  expect(current.wallet.available_incense).toBe(20)
  expect(frame(id, current).wallet).toEqual(current.wallet)
  expect(current.market?.batches.every(b => b.position === null)).toBe(true)
})
