import { VOTE_COUNT_MAX, type VoteType } from '../domain/index.ts'

export const DAY_END_ACTION_HEADER = 'x-liangxiang-day-end-action'
export const DAY_END_ACTION_VALUE = 'explicit'

export interface DayEndPreferences { enabled: boolean, voteType: VoteType }
export interface DayEndJob {
  businessDate: string
  caseId: string
  requestId: string
  voteType: VoteType
  count: number
  done: boolean
}
export interface DayEndState extends DayEndPreferences {
  jobs: { online?: DayEndJob, local?: DayEndJob }
}
export interface DayEndPersistence {
  getDayEndState(): DayEndState | null
  setDayEndState(state: DayEndState): Promise<void>
}
export interface DayEndTiming { now: number, endsAt: number, businessDate: string }
export const DEFAULT_DAY_END: DayEndState = { enabled: false, voteType: 'up', jobs: {} }

/** Strict boundary validation, shared by storage and the same-origin API. */
export function parseDayEndPreferences(raw: unknown): DayEndPreferences {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('expected day-end preferences')
  const r = raw as Record<string, unknown>
  if (typeof r.enabled !== 'boolean' || (r.voteType !== 'up' && r.voteType !== 'down')) throw new Error('invalid day-end preferences')
  return { enabled: r.enabled, voteType: r.voteType }
}

export function parseDayEndState(raw: unknown): DayEndState {
  const prefs = parseDayEndPreferences(raw)
  const r = raw as Record<string, unknown>
  if (typeof r.jobs !== 'object' || r.jobs === null || Array.isArray(r.jobs)) throw new Error('invalid day-end jobs')
  const jobs: DayEndState['jobs'] = {}
  for (const mode of ['online', 'local'] as const) {
    const job = (r.jobs as Record<string, unknown>)[mode]
    if (job === undefined) continue
    if (typeof job !== 'object' || job === null) throw new Error('invalid day-end job')
    const j = job as Record<string, unknown>
    if (typeof j.businessDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(j.businessDate)
      || typeof j.caseId !== 'string' || !j.caseId.length
      || typeof j.requestId !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(j.requestId)
      || (j.voteType !== 'up' && j.voteType !== 'down') || typeof j.done !== 'boolean'
      || !Number.isSafeInteger(j.count) || (j.count as number) < 1 || (j.count as number) > VOTE_COUNT_MAX) throw new Error('invalid day-end job')
    jobs[mode] = { businessDate: j.businessDate, caseId: j.caseId, requestId: j.requestId, voteType: j.voteType, count: j.count as number, done: j.done }
  }
  return { ...prefs, jobs }
}
