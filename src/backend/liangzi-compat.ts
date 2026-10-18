/** Read-only legacy presentation. Canonical rows and vote receipts are never changed. */
import {
  deriveLiangziState,
  LEGACY_LIANGZI_POLICY_VERSION,
  LEGACY_LIANGZI_THRESHOLDS,
} from '../domain/index.ts'
import type { V1Bootstrap, V1Case, V1Snapshot, V1SnapshotResponse, V1VoteResponse } from '../shared/backend-v1.ts'
import type { V1HistoryResponse } from '../shared/history-v1.ts'

type LiveResponse = V1Bootstrap | V1SnapshotResponse | V1VoteResponse

function legacySnapshot(snapshot: V1Snapshot): V1Snapshot {
  return {
    ...snapshot,
    liangzi_state: deriveLiangziState(snapshot.up_votes, snapshot.down_votes, LEGACY_LIANGZI_THRESHOLDS),
    policy_version: LEGACY_LIANGZI_POLICY_VERSION,
  }
}

/** Old binaries reject new enums, five-boundary bootstraps, and new archive policy ids. */
export function legacyLiangziView(response: LiveResponse): LiveResponse {
  return {
    ...response,
    ...('active_case' in response ? { active_case: legacyCase(response.active_case) } : {}),
    ...('liangzi_policy' in response ? {
      liangzi_policy: { version: LEGACY_LIANGZI_POLICY_VERSION, boundaries: LEGACY_LIANGZI_THRESHOLDS.boundaries },
    } : {}),
    global_snapshot: legacySnapshot(response.global_snapshot),
  }
}

function legacyCase(caseRow: V1Case): V1Case {
  return { ...caseRow, liangzi_policy_version: LEGACY_LIANGZI_POLICY_VERSION }
}

export function legacyLiangziHistory(response: V1HistoryResponse): V1HistoryResponse {
  return {
    ...response,
    days: response.days.map(day => ({ ...day, liangzi_policy_version: LEGACY_LIANGZI_POLICY_VERSION })),
    weeks: response.weeks.map(week => ({ ...week, liangzi_policy_version: LEGACY_LIANGZI_POLICY_VERSION })),
    months: response.months.map(month => ({ ...month, liangzi_policy_version: LEGACY_LIANGZI_POLICY_VERSION })),
  }
}
