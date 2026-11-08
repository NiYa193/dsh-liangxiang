/**
 * Read-only daily protocol for installed pre-wallet clients. It never creates
 * credit or rewrites the cumulative wallet, Token claims or accepted votes.
 */
import type { V1Bootstrap, V1PersonalState, V1PersonalStateResponse, V1VoteResponse } from '../shared/backend-v1.ts'

export class LegacyWalletUpgradeRequiredError extends Error {
  constructor() {
    super('This installation has used cumulative or frozen assets. Update Liangxiang to continue with this wallet; its funds and identity are preserved.')
    this.name = 'LegacyWalletUpgradeRequiredError'
  }
}

/** Old binaries can only represent today's actual claim and actual spending. */
export function legacyDailyPersonal(personal: V1PersonalState): V1PersonalState {
  const earned = Math.floor(personal.claimed_effective_tokens / personal.token_per_incense)
  const remaining = earned - personal.used_incense
  const available = personal.wallet?.available_incense ?? personal.remaining_incense
  // A mixed/downgraded installation cannot honestly fit the old equations.
  // Do not invent Tokens, hide accepted votes, or expose frozen funds as cash.
  if (remaining < 0 || available < remaining) throw new LegacyWalletUpgradeRequiredError()
  const remainder = personal.claimed_effective_tokens % personal.token_per_incense
  const { wallet: _wallet, ...daily } = personal
  return { ...daily, earned_incense: earned, remaining_incense: remaining,
    token_remainder: remainder, tokens_to_next_incense: personal.token_per_incense - remainder }
}

export function legacyWalletView(response: V1Bootstrap): V1Bootstrap
export function legacyWalletView(response: V1PersonalStateResponse): V1PersonalStateResponse
export function legacyWalletView(response: V1VoteResponse): V1VoteResponse
export function legacyWalletView(response: V1Bootstrap | V1PersonalStateResponse | V1VoteResponse): V1Bootstrap | V1PersonalStateResponse | V1VoteResponse {
  const personal = legacyDailyPersonal(response.authoritative_personal_state)
  if ('result' in response && response.result.status === 'accepted') {
    return { ...response, authoritative_personal_state: personal,
      result: { ...response.result, used_incense: personal.used_incense, remaining_incense: personal.remaining_incense } }
  }
  return { ...response, authoritative_personal_state: personal }
}
