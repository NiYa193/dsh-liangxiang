# Isolated test migration receipt

The two private test environments have moved from the lightweight standby to
ECS. Production, its DNS, the ordinary old standby service and original backup
files were not changed. This operation is independent of the new client UI.

## Data and runtime

| Environment | Retained data | Running source |
| --- | --- | --- |
| Accelerated rehearsal, loopback 4195 | 52 wallets, 1,574 positions, 528 receipts; 85,289 available incense, zero frozen | `16503a7`, alpha.12-u1 |
| Real-clock internal test, loopback 4196 | Original identity and 1,000 available incense; zero frozen | `4e17d49`, alpha.12-u1 |

Both builds use the previously validated `1879c10` business implementation.
The later changes are deployment guards, evidence and the optional legacy
backup-directory fix. No new market rules or UI were deployed by this migration.

The completed ECS capacity ledger was moved intact to a separate private cold
archive before restoring the ongoing rehearsal. It was not combined with the
restored database. The original rehearsal clock epoch and paused state were
preserved. The completed twelve-client activity files and identities remain
available; no new accelerated activity or load run was started.

## Verification

- Each stopped-source SQLite snapshot passed integrity and foreign-key checks.
- Identity, wallet, journal, usage cursor, vote, request, position, receipt and
  sealed-history digests matched after restoration, before client reconnection.
- Wallet/journal totals, position freezing and settled-pool conservation showed
  zero mismatches in both databases. No wallet was negative.
- Eleven basic checks used a disposable database copy and the deployed compiled
  modules: signed admission, bootstrap, vote replay, long-position replay,
  direction change, withdrawal/refund, final balance, history, candles, receipts
  and snapshot reads. The restored manual ledgers were not used as scratch data.
- Five strict-TLS health requests from each existing test origin succeeded.
  These are connectivity checks, not a new latency percentile or capacity study.
- The real-clock DSH client retained its profile and opened successfully. The
  accelerated DSH process was not restarted: its existing loopback relay was
  retargeted, its backend health was checked, and its stored identity was
  unchanged. A fresh browser context did not have that process's current web
  login; no authentication protection was bypassed to obtain a UI screenshot.
- The observer and internal-client launcher now target ECS. The observer retains
  the completed run's honest status; it does not claim new simulated activity.

## Retirement and recovery

The two old isolated services are stopped and disabled. Their HTTPS test route
returns 410 rather than silently accepting writes. Active Node/DSH environments
and current entry scripts no longer reference the old host. Server-side test
configuration on ECS also has no old-host reference.

The ordinary old standby service and backup schedule remain untouched. Its data
and historical backups had already been cold-exported; the subsequent latest
daily backup was additionally copied and checksum-verified. These private
archives are present locally and on ECS. They contain real identities and must
never be added to Git. A separate daily backup for the two restored test ledgers
has been enabled and its first execution succeeded.

The production service PID/start time and version are unchanged. The old ordinary
standby PID/start time and original seed checksum are unchanged. There was no
production deployment, DNS cutover, backup rewrite or full pressure retest.

After retirement, recovery must use the retained snapshots and the recorded
matching application build. Once clients have written to ECS, capture those
new writes before any reverse migration; do not revive an older writable copy.

Private operator receipts include exact addresses, file hashes, client identity
fingerprints, service states, TLS timings and backup checksums. Those details
are intentionally excluded from repository documentation.
