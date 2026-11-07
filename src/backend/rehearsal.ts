/** Private rehearsal executable. Never imported by the ordinary backend or plugin. */
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveBackendConfig, DEFAULT_BACKEND_LISTEN_BACKLOG } from './config.ts'
import { createBackendHttpApi } from './http.ts'
import { LiangxiangBackendService } from './service.ts'
import { openBackendStore } from './store.ts'

export interface RehearsalClockControl { epoch_ms: number; anchor_wall_ms: number; rate: number }

export function parseRehearsalClock(value: unknown): RehearsalClockControl {
  const clock = value as Partial<RehearsalClockControl> | null
  if (!clock || !Number.isSafeInteger(clock.epoch_ms) || !Number.isSafeInteger(clock.anchor_wall_ms)
    || typeof clock.rate !== 'number' || !Number.isFinite(clock.rate) || clock.rate < 0 || clock.rate > 10_000
    || clock.epoch_ms! < Date.UTC(2000, 0, 1) || clock.epoch_ms! >= Date.UTC(2100, 0, 1)) {
    throw new Error('Invalid private rehearsal business clock')
  }
  return clock as RehearsalClockControl
}

export function createRehearsalClock(file: string, wallNow = Date.now): { now(): number } {
  let highWater = 0
  return { now() {
    const control = parseRehearsalClock(JSON.parse(readFileSync(file, 'utf8')))
    const next = Math.floor(control.epoch_ms + Math.max(0, wallNow() - control.anchor_wall_ms) * control.rate)
    if (!Number.isSafeInteger(next) || next >= Date.UTC(2100, 0, 1)) throw new Error('Rehearsal clock out of range')
    // No backwards business dates within a running service, including a wall-clock correction.
    highWater = Math.max(highWater, next)
    return highWater
  } }
}

export function validateRehearsalEnvironment(env: Record<string, string | undefined>): { databasePath: string; clockFile: string } {
  if (env.LIANGXIANG_REHEARSAL !== '1' || env.LIANGXIANG_BACKEND_HOST !== '127.0.0.1'
    || env.LIANGXIANG_BACKEND_PORT !== '4195' || env.LIANGXIANG_ALLOW_UNSIGNED === '1') {
    throw new Error('Rehearsal requires explicit opt-in, signed authentication and loopback port 4195')
  }
  const databasePath = resolve(env.LIANGXIANG_BACKEND_DB ?? '')
  const clockFile = resolve(env.LIANGXIANG_REHEARSAL_CLOCK_FILE ?? '')
  const directory = dirname(databasePath)
  const temporary = directory.startsWith(join(realpathSync(tmpdir()), 'liangxiang-rehearsal-')) && basename(directory) === 'rehearsal'
  if ((directory !== '/var/lib/liangxiang/rehearsal' && !temporary)
    || basename(databasePath) !== 'liangxiang-rehearsal.sqlite' || clockFile !== join(directory, 'clock.json')
    || realpathSync(directory) !== directory || !lstatSync(clockFile).isFile() || lstatSync(clockFile).nlink !== 1) {
    throw new Error('Rehearsal refuses ordinary backend paths and symbolic links')
  }
  try { if (!lstatSync(databasePath).isFile() || lstatSync(databasePath).nlink !== 1) throw new Error('Rehearsal database must be a separate regular file') }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  return { databasePath, clockFile }
}

export function startRehearsal(env: Record<string, string | undefined> = process.env): { close(): Promise<void> } {
  const paths = validateRehearsalEnvironment(env)
  const clock = createRehearsalClock(paths.clockFile)
  clock.now() // Validate before opening or migrating any database.
  const config = resolveBackendConfig({ ...env, LIANGXIANG_ALLOW_UNSIGNED: '0', LIANGXIANG_AUTHORITY_MODE: 'DEV_STAGING_ONLY' })
  const store = openBackendStore(paths.databasePath)
  let service: LiangxiangBackendService
  try { service = new LiangxiangBackendService({ store, config, clock }); service.ensureActiveCase() }
  catch (error) { store.close(); throw error }
  const api = createBackendHttpApi({ service, store, allowUnsigned: false,
    voteRateLimitPerMinute: config.voteRateLimitPerMinute, voteRateLimitMaxKeys: config.voteRateLimitMaxKeys, voteClock: clock,
    admissionClaimRateLimitPerMinute: config.admissionClaimRateLimitPerMinute })
  // Business deadlines and vote refill share the persisted vote clock. HTTP
  // signatures, market admission and socket lifetimes retain real wall time.
  // No clock-control HTTP route exists.
  const timer = setInterval(() => {
    try { service.tick(); service.replenishAdmissionInventory() }
    catch { console.error('[liangxiang-backend] rehearsal clock/tick failed; stopping isolated service'); process.exitCode = 1; void close() }
  }, 200)
  let closing: Promise<void> | null = null
  const close = (): Promise<void> => {
    closing ??= new Promise(resolveClose => {
      clearInterval(timer); api.reset()
      api.server.close(() => { store.close(); resolveClose() })
      api.server.closeAllConnections()
    })
    return closing
  }
  api.server.once('error', () => { console.error('[liangxiang-backend] rehearsal listener failed'); process.exitCode = 1; void close() })
  api.server.listen(4195, '127.0.0.1', DEFAULT_BACKEND_LISTEN_BACKLOG, () => console.log('[liangxiang-backend] ISOLATED REHEARSAL: synthetic business clock; soft-trust usage; signed requests required'))
  return { close }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const runtime = startRehearsal()
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void runtime.close() })
}
