import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LiangxiangBackendService } from '../src/backend/service.ts'
import { MarketLedger } from '../src/backend/market-ledger.ts'
import { openBackendStore } from '../src/backend/store.ts'
import { migrate } from '../src/backend/schema.ts'
import { resolveBackendConfig } from '../src/backend/config.ts'
import { parseMarketHistoryResponse, parseMarketState, type MarketPositionRequest } from '../src/shared/market-v1.ts'
import { createBackendFixture, createMutableClock, type BackendFixture } from './helpers/backend.ts'

const A = 'market-wallet-a'
const B = 'market-wallet-b'
const C = 'market-wallet-c'
const D = 'market-wallet-d'
const MAKER = 'market-vote-maker'
const at = (hour: number, minute = 0, day = 16): number => Date.UTC(2026, 7, day, hour - 8, minute)
let f: BackendFixture | undefined
afterEach(() => { f?.close(); f = undefined })
function boot(hour = 9): BackendFixture { f = createBackendFixture({}, at(hour)); return f }
function point(f: BackendFixture, direction: 'up' | 'down', count: number, id: string): void {
  const result = f.service.vote(MAKER, { case_id: f.service.ensureActiveCase().id,
    vote_type: direction, count, request_id: id }).result
  expect(result.status).toBe('accepted')
}
function fund(f: BackendFixture): void {
  for (const id of [A, B, C, D, MAKER]) f.grantIncense(id, 100)
  point(f, 'up', 10, 'market-seed-up')
  point(f, 'down', 10, 'market-seed-down')
}
function position(f: BackendFixture, id: string, side: 'long' | 'short' | null, amount: number,
  requestId: string, batch: 1 | 2 | 3 = 1) {
  const state = f.service.marketState(id)
  return f.service.setMarketPosition(id, { market_id: state.market!.id,
    batch, side, amount, request_id: requestId })
}

describe('cumulative server wallet', () => {
  it('carries unspent funds and fractional progress while daily statistics reset', () => {
    const f = boot()
    f.grantIncense(A, 2, 49_000)
    f.service.vote(A, { case_id: f.service.ensureActiveCase().id, vote_type: 'up', request_id: 'wallet-day-one' })
    f.clock.set(at(9, 0, 17))
    const next = f.service.dailyState(A).authoritative_personal_state
    expect(next).toMatchObject({ earned_incense: 0, used_incense: 0, remaining_incense: 1, token_remainder: 49_000 })
    const earned = f.service.applyTokenClaim(A, { claim_business_date: '2026-08-17', claimed_effective_tokens: 1_000 })
    expect(earned.authoritative_personal_state).toMatchObject({ earned_incense: 1, remaining_incense: 2, token_remainder: 0 })
    f.service.applyTokenClaim(A, { claim_business_date: '2026-08-17', claimed_effective_tokens: 1_000 })
    expect(f.service.marketState(A).wallet.available_incense).toBe(2)
    // Historical funds may be spent even when today's generated amount is smaller.
    f.service.vote(A, { case_id: f.service.ensureActiveCase().id, vote_type: 'up', count: 2, request_id: 'wallet-carry-spend' })
    expect(f.service.dailyState(A).authoritative_personal_state).toMatchObject({ used_incense: 2, earned_incense: 1, remaining_incense: 0 })
  })

  it('adds one daily gift to the same wallet without resetting old funds or duplicating the gift', () => {
    const f = boot()
    f.store.upsertIdentity({ installation_id: A, public_key: 'wallet-gift-key', device_fingerprint: 'wallet-gift-device', created_at: f.clock.now(), last_seen_at: f.clock.now() })
    expect(f.service.marketState(A).wallet.available_incense).toBe(10)
    f.service.bootstrap(A)
    expect(f.service.marketState(A).wallet.available_incense).toBe(10)
    f.clock.set(at(9, 0, 17))
    expect(f.service.marketState(A).wallet.available_incense).toBe(20)
    f.service.bootstrap(A)
    expect(f.service.marketState(A).wallet.available_incense).toBe(20)
    expect(() => f.service.revokeIdentity(A)).toThrow('wallet has assets')
  })

  it('freezes funds atomically with voting and returns only a cancelled reservation', () => {
    const f = boot(); fund(f)
    expect(position(f, A, 'long', 80, 'reserve-80').accepted).toBe(true)
    expect(f.service.marketState(A).wallet).toMatchObject({ available_incense: 20, frozen_incense: 80, total_incense: 100 })
    const vote = f.service.vote(A, { case_id: f.service.ensureActiveCase().id, vote_type: 'up', count: 50, request_id: 'reserve-vote' })
    expect(vote.result).toMatchObject({ status: 'accepted', spent_incense: 20 })
    expect(position(f, A, 'long', 81, 'reserve-too-much').accepted).toBe(false)
    expect(position(f, A, null, 0, 'reserve-cancel').accepted).toBe(true)
    expect(f.service.marketState(A).wallet).toMatchObject({ available_incense: 80, frozen_incense: 0 })
    expect(position(f, A, null, 0, 'reserve-cancel').accepted).toBe(true)
    expect(f.service.marketState(A).wallet.available_incense).toBe(80)
    expect(position(f, A, 'short', 10, 'reserve-cancel').reason).toBe('idempotency_conflict')
  })
})

describe('three daily sealed pools', () => {
  it('locks before the reference period and seals the exact pre-vote counts at its deadline', () => {
    const f = boot(); fund(f)
    position(f, A, 'long', 10, 'point-long')
    position(f, B, 'short', 10, 'point-short')
    f.clock.set(at(11))
    expect(position(f, A, 'short', 20, 'late-change').reason).toBe('batch_not_open')
    expect(f.service.marketState(A).market!.batches[0]).toMatchObject({ status: 'locked', reference: null })
    point(f, 'up', 10, 'during-reference-up')
    f.clock.set(at(12))
    point(f, 'down', 10, 'after-reference-down')
    const batch = f.service.marketState(A).market!.batches[0]!
    expect(batch.reference).toMatchObject({ at: at(12), up_votes: 20, down_votes: 10 })
    expect(f.service.marketState(A).current_point).toMatchObject({ up_votes: 20, down_votes: 20 })
    expect(batch.position).toMatchObject({ side: 'long', amount: 10, payout: null })
    expect(batch.status).toBe('live')
  })

  it('allows later batches to change direction but never rewrites an older sealed position', () => {
    const f = boot(); fund(f)
    position(f, A, 'short', 10, 'batch-one-short')
    position(f, B, 'long', 10, 'batch-one-counter')
    f.clock.set(at(12))
    position(f, A, 'long', 20, 'batch-two-long', 2)
    position(f, B, 'short', 20, 'batch-two-counter', 2)
    f.clock.set(at(18))
    position(f, A, 'short', 30, 'batch-three-short', 3)
    position(f, B, 'long', 30, 'batch-three-counter', 3)
    const state = parseMarketState(f.service.marketState(A))
    expect(state.market!.batches.map(b => b.position?.side)).toEqual(['short', 'long', 'short'])
    expect(state.wallet).toMatchObject({ available_incense: 40, frozen_incense: 60 })
    expect(position(f, A, 'long', 11, 'try-old-pool', 1).accepted).toBe(false)
  })

  it('splits the whole losing pool with integer remainders and pays exactly once after midnight', () => {
    const f = boot(); fund(f)
    for (const [id, request] of [[A, 'first-winner'], [B, 'second-winner'], [D, 'third-winner']] as const) {
      position(f, id, 'long', 10, request)
    }
    position(f, C, 'short', 20, 'the-losing-pool')
    f.clock.set(at(12)); f.service.tick()
    point(f, 'up', 10, 'close-up')
    f.clock.set(at(0, 0, 17))
    f.service.tick()
    const available = [A, B, D, C].map(id => f.service.marketState(id).wallet.available_incense)
    expect(available).toEqual([107, 107, 106, 80])
    expect(available.reduce((n, v) => n + v, 0)).toBe(400)
    for (let i = 0; i < 5; i += 1) f.service.tick()
    expect([A, B, D, C].map(id => f.service.marketState(id).wallet.available_incense)).toEqual(available)
    const receipt = parseMarketHistoryResponse(f.service.marketHistory(A)).receipts[0]!
    expect(receipt).toMatchObject({ invested_incense: 10, returned_incense: 17, pnl_incense: 7 })
    expect(receipt.business_date).toBe('2026-08-16')
    expect(receipt.close_point).toMatchObject({ case_id: 'case-2026-08-16', at: at(0, 0, 17), up_votes: 20, down_votes: 10 })
  })

  it('refunds a tied pool, a one-sided pool, and an invalid reference without extra minting', () => {
    const f = boot(); fund(f)
    position(f, A, 'long', 10, 'tie-long')
    position(f, B, 'short', 10, 'tie-short')
    f.clock.set(at(12)); f.service.tick()
    position(f, A, 'long', 20, 'one-side', 2)
    f.clock.set(at(17)); f.service.tick()
    expect(f.service.marketState(A).wallet).toMatchObject({ available_incense: 90, frozen_incense: 10 })
    expect(f.service.marketState(A).market!.batches[1]!.status).toBe('void')
    f.clock.set(at(0, 0, 17)); f.service.tick()
    expect(f.service.marketState(A).wallet.available_incense).toBe(100)
    expect(f.service.marketHistory(A).receipts[0]!.batches[0]!.result).toBe('draw')
  })

  it('cancels and refunds all locked funds when an operator replaces the case', () => {
    const f = boot(); fund(f)
    position(f, A, 'long', 20, 'replace-long')
    position(f, B, 'short', 30, 'replace-short')
    f.clock.set(at(12)); f.service.tick()
    f.service.publishCase('新的梁案')
    expect(f.service.marketState(A).wallet).toMatchObject({ available_incense: 100, frozen_incense: 0 })
    expect(f.service.marketState(A).market).toBeNull()
    expect(f.store.database.prepare('SELECT COUNT(*) AS n FROM liang_market WHERE business_date=?').get('2026-08-16'))
      .toMatchObject({ n: 1 })
    expect(f.service.marketHistory(A).receipts[0]!).toMatchObject({ invested_incense: 20, returned_incense: 20, pnl_incense: 0 })
  })

  it('keeps pending references unknown and bounds all cold-channel pages', () => {
    const f = boot(); fund(f)
    const state = parseMarketState(f.service.marketState(A))
    expect(state.market!.batches.every(b => b.reference === null)).toBe(true)
    expect(() => f.service.marketHistory(A, undefined, 51)).toThrow('limit')
    expect(() => f.service.marketHistory(A, 'not-a-cursor')).toThrow('cursor')
    expect(() => f.service.marketCandles({ limit: 289 })).toThrow('limit')
    expect(f.service.marketCandles().candles.length).toBeLessThanOrEqual(288)
  })

  it('serves steady cloud subscribers without opening a write transaction per connection', () => {
    const f = boot(); fund(f)
    const transactions = vi.spyOn(f.store, 'transaction')
    for (let i = 0; i < 50; i += 1) f.service.marketStateForStream(A)
    expect(transactions).not.toHaveBeenCalled()
    transactions.mockRestore()
    f.clock.set(at(9, 0, 17))
    f.service.snapshotResponse() // The shared public pump owns rollover once.
    const nextDay = vi.spyOn(f.store, 'transaction')
    for (let i = 0; i < 50; i += 1) f.service.marketStateForStream(A)
    expect(nextDay).toHaveBeenCalledTimes(1) // One new daily claim/gift row, not 50.
    nextDay.mockRestore()
  })
})

describe('wallet v11 migration and durable restart', () => {
  it('observes another process pool changes through the persisted market version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-market-version-'))
    const path = join(dir, 'wallet.sqlite')
    const config = resolveBackendConfig({ LIANGXIANG_BACKEND_DB: path, LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0' })
    const clock = createMutableClock(at(9))
    const first = openBackendStore(path)
    const second = openBackendStore(path)
    try {
      const one = new LiangxiangBackendService({ store: first, config, clock })
      const two = new LiangxiangBackendService({ store: second, config, clock })
      one.applyTokenClaim(A, { claim_business_date: '2026-08-16', claimed_effective_tokens: 1_000_000 })
      one.dailyState(B)
      const before = one.marketStreamVersion(B)
      const id = two.marketState(A).market!.id
      expect(two.setMarketPosition(A, { market_id: id, batch: 1, side: 'short', amount: 10, request_id: 'other-process-position' }).accepted).toBe(true)
      expect(one.marketStreamVersion(B)).not.toBe(before)
      expect(one.marketState(B).market!.batches[0]!.short_incense).toBe(10)
      // A rollback must not poison the shared aggregate cache.
      const ledger = new MarketLedger(first, config.timezone)
      const currentCase = one.ensureActiveCase()
      expect(ledger.state(B, currentCase, clock.now()).market!.batches[0]!.short_incense).toBe(10)
      expect(() => first.transaction(() => {
        first.database.prepare('UPDATE liang_market_position SET amount=11 WHERE installation_id=?').run(A)
        first.database.prepare('UPDATE liang_market SET version=version+1').run()
        expect(ledger.state(B, currentCase, clock.now()).market!.batches[0]!.short_incense).toBe(11)
        throw new Error('intentional rollback')
      })).toThrow('intentional rollback')
      expect(ledger.state(B, currentCase, clock.now()).market!.batches[0]!.short_incense).toBe(10)
    } finally { first.close(); second.close(); rmSync(dir, { recursive: true, force: true }) }
  })

  it('imports only the cutover day once, fences historical claims, and restores pending funds after restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'liangxiang-wallet-migration-'))
    const databasePath = join(dir, 'ledger.sqlite')
    try {
      const db = new DatabaseSync(databasePath)
      migrate(db)
      db.exec(`
        DROP TABLE liang_market_position; DROP TABLE liang_market_batch;
        DROP TABLE liang_market_receipt; DROP TABLE liang_market_request;
        DROP TABLE liang_market_candle; DROP TABLE liang_market;
        DROP TABLE incense_wallet_entry; DROP TABLE incense_wallet_cursor; DROP TABLE incense_wallet;
        ALTER TABLE daily_incense_state RENAME TO temporary_daily;
        CREATE TABLE daily_incense_state (
          installation_id TEXT NOT NULL,business_date TEXT NOT NULL,claimed_effective_tokens INTEGER NOT NULL,
          used_incense INTEGER NOT NULL,token_per_incense INTEGER NOT NULL,claim_source TEXT NOT NULL,
          version INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,starter_tokens INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(installation_id,business_date),CHECK(used_incense*token_per_incense<=claimed_effective_tokens));
        DROP TABLE temporary_daily;
        INSERT INTO daily_incense_state VALUES ('market-wallet-a','2026-08-15',500000,0,50000,'host_observed_unverified',0,1,1,0);
        INSERT INTO daily_incense_state VALUES ('market-wallet-a','2026-08-16',249000,1,50000,'host_observed_unverified',0,1,1,0);
        PRAGMA user_version=11;
      `)
      db.close()
      const clock = createMutableClock(at(9))
      const config = resolveBackendConfig({ LIANGXIANG_BACKEND_DB: databasePath, LIANGXIANG_ADMISSION_INVENTORY_TARGET: '0' })
      let store = openBackendStore(databasePath)
      let service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
      expect(service.marketState(A).wallet).toMatchObject({ available_incense: 3, token_remainder: 49_000 })
      service.applyTokenClaim(A, { claim_business_date: '2026-08-16', claimed_effective_tokens: 249_000 })
      expect(service.marketState(A).wallet.available_incense).toBe(3)
      const intent: MarketPositionRequest = { market_id: service.marketState(A).market!.id,
        batch: 1, side: 'long', amount: 2, request_id: 'durable-position' }
      service.setMarketPosition(A, intent)
      expect(service.marketState(A).wallet).toMatchObject({ available_incense: 1, frozen_incense: 2 })
      store.close()
      store = openBackendStore(databasePath)
      service = new LiangxiangBackendService({ store, config, clock, warn: () => undefined })
      expect(service.setMarketPosition(A, intent).accepted).toBe(true)
      expect(service.marketState(A).wallet).toMatchObject({ available_incense: 1, frozen_incense: 2 })
      clock.set(at(11)); service.tick()
      expect(service.marketState(A).wallet).toMatchObject({ available_incense: 3, frozen_incense: 0 })
      store.close()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
