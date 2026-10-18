/** Community Liangzi states. Zero votes are a placeholder, never a voted tier. */
import { DomainError, assertCount } from './errors.ts'

export const ACTIVE_LIANGZI_STATES = [
  'xiao_nan_liang', 'liang_gong', 'liang_zong', 'liang_shen', 'liang_sheng', 'liang_zu',
] as const
export const LIANGZI_STATES = ['waiting', ...ACTIVE_LIANGZI_STATES] as const
export type LiangziState = (typeof LIANGZI_STATES)[number]
export type ActiveLiangziState = (typeof ACTIVE_LIANGZI_STATES)[number]

/** Four boundaries identify the legacy five-tier policy; five identify six tiers. */
export type LiangziBoundaries = readonly [number, number, number, number]
  | readonly [number, number, number, number, number]
export interface LiangziThresholdPolicy { readonly boundaries: LiangziBoundaries }

export const LEGACY_LIANGZI_POLICY_VERSION = 'liangzi-v0.1-50-70-85-95'
export const LIANGZI_POLICY_VERSION = 'liangzi-v0.2-25-50-70-85-95'
export const LEGACY_LIANGZI_THRESHOLDS: LiangziThresholdPolicy = {
  boundaries: [0.5, 0.7, 0.85, 0.95],
}
export const DEFAULT_LIANGZI_THRESHOLDS: LiangziThresholdPolicy = {
  boundaries: [0.25, 0.5, 0.7, 0.85, 0.95],
}

/** Stored versions are immutable. Unknown versions must not silently rewrite history. */
export function liangziPolicyForVersion(version: string): LiangziThresholdPolicy {
  if (version === LIANGZI_POLICY_VERSION) return DEFAULT_LIANGZI_THRESHOLDS
  if (version === LEGACY_LIANGZI_POLICY_VERSION) return LEGACY_LIANGZI_THRESHOLDS
  throw new DomainError('invalid_policy', `unsupported Liangzi policy ${version}`)
}

export function assertValidThresholdPolicy(policy: LiangziThresholdPolicy): void {
  const { boundaries } = policy
  if (!Array.isArray(boundaries) || (boundaries.length !== 4 && boundaries.length !== 5)) {
    throw new DomainError('invalid_policy', 'threshold policy must have 4 or 5 boundaries')
  }
  for (let i = 0; i < boundaries.length; i += 1) {
    const boundary = boundaries[i] as number
    if (typeof boundary !== 'number' || !Number.isFinite(boundary) || boundary <= 0 || boundary >= 1) {
      throw new DomainError('invalid_policy', `threshold boundary out of (0,1): ${String(boundary)}`)
    }
    if (i > 0 && boundary <= (boundaries[i - 1] as number)) {
      throw new DomainError('invalid_policy', 'threshold boundaries must be strictly ascending (no overlap, no gap)')
    }
  }
}

function statesForPolicy(policy: LiangziThresholdPolicy): readonly ActiveLiangziState[] {
  return policy.boundaries.length === 4 ? ACTIVE_LIANGZI_STATES.slice(1) : ACTIVE_LIANGZI_STATES
}

export function liangziStateForUpRatio(
  upRatio: number,
  policy: LiangziThresholdPolicy = DEFAULT_LIANGZI_THRESHOLDS,
): ActiveLiangziState {
  assertValidThresholdPolicy(policy)
  if (typeof upRatio !== 'number' || !Number.isFinite(upRatio) || upRatio < 0 || upRatio > 1) {
    throw new DomainError('invalid_policy', `upRatio out of [0,1]: ${String(upRatio)}`)
  }
  const states = statesForPolicy(policy)
  const index = policy.boundaries.findIndex(boundary => upRatio < boundary)
  return states[index === -1 ? states.length - 1 : index] as ActiveLiangziState
}

export interface LiangziUpRatioBand {
  minInclusive: number | null
  maxExclusive: number | null
}

/** UI ranges use the same policy as the figure, including sealed legacy portraits. */
export function liangziUpRatioBand(
  state: LiangziState,
  policy: LiangziThresholdPolicy = DEFAULT_LIANGZI_THRESHOLDS,
): LiangziUpRatioBand {
  assertValidThresholdPolicy(policy)
  if (state === 'waiting') return { minInclusive: null, maxExclusive: null }
  const index = statesForPolicy(policy).indexOf(state)
  if (index < 0) throw new DomainError('invalid_policy', `${state} does not exist in this policy`)
  return {
    minInclusive: index === 0 ? null : policy.boundaries[index - 1] as number,
    maxExclusive: policy.boundaries[index] ?? null,
  }
}

export function deriveLiangziState(
  upVotes: number,
  downVotes: number,
  policy: LiangziThresholdPolicy = DEFAULT_LIANGZI_THRESHOLDS,
): LiangziState {
  assertCount(upVotes, 'invalid_vote_count', 'upVotes')
  assertCount(downVotes, 'invalid_vote_count', 'downVotes')
  const total = upVotes + downVotes
  if (total === 0) return 'waiting'
  return liangziStateForUpRatio(upVotes / total, policy)
}
