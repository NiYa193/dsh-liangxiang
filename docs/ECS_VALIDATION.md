# ECS isolated validation

Freeze business implementation at alpha.12 / `1879c10`. The validation branch adds deployment guard support only; it does not change the plugin, ledger or transport contract.

A standby may use the exact hostname `liangxiang` when its explicit deployment role is `standby`. Before upload, the active Caddy service must use `Caddyfile.standby`, and the generic host must contain `/etc/liangxiang-deploy-role`: a regular, non-symlink file owned by root with mode 0600 and content `standby`. Isolated installers recheck the marker. A production role cannot use this generic name. Existing role-bearing hostnames retain their checks.

Validation uses an empty independent rehearsal ledger and synthetic identities. The ordinary production ledger, prior standby and original backups are outside this deployment. A private business clock covers market boundaries without changing the OS clock. Public DNS and production routing remain unchanged.

## Verified results

Business source remains `1879c10`, alpha.12; the deployed receipt is `6e2fbe1` / `1.3.0-alpha.12-u1`, schema 14. Initial source verification passed 993 tests; the deployment guard suite passed 18 checks, including marker ownership/mode/link rejection. Guard shell tests mock GNU stat for portability and do not assume an unprivileged CI user.

Rocky Linux 10.2, Node 22.23.2 and Caddy 2.11.7 were verified after updating and rebooting. The key-only management account is the sole SSH allowlisted user; root SSH/password authentication and port 22 are disabled. SELinux is enforcing, the host firewall is active, and the hostname persists. The disabled crash-dump reservation was removed, reclaiming 256 MiB. Public-IP TLS issuance and simulated renewal passed; renewal, security-only package updates without automatic OS reboot, and a verified daily seven-day backup are configured.

Two origins (UK egress and Shanghai) each drove 100 synthetic registered identities. Each kept an SSE connection and performed signed requests with 1.7-3.1 second think time. This is 200 concurrent users, not 200 requests/second; it does not simulate every user's entire DSH GUI or cover all mainland carriers.

The ramp was 0 for 15 seconds, then 50/100/150 for 60 seconds each and 200 for 960 seconds. Numbers below include connection and reconnect waves; short stages have a larger cold-start share.

| Concurrent users | UK RPC P95 ms | Shanghai RPC P95 ms | Host CPU mean % | NIC TX mean Mbps |
|---:|---:|---:|---:|---:|
| 50 | 625.4 | 208.6 | 5.1 | 0.94 |
| 100 | 227.5 | 85.6 | 7.5 | 2.68 |
| 150 | 222.8 | 63.9 | 9.8 | 4.14 |
| 200 | 220.9 | 56.4 | 11.4 | 5.87 |

At sustained 200: 97,256 RPCs, zero unexpected failures or wire/semantic errors, no unresolved vote/position intent, and no listener queue drops/overflows. Host CPU averaged 11.4% of the two-vCPU capacity, available memory stayed above 2.59 GiB, backend RSS averaged 126 MiB, and TX averaged 5.87 Mbps (P95 6.35, one-second maximum 8.33). All peers recovered after the forced reconnect wave in 4.49 seconds (UK) and 2.91 seconds (Shanghai).

Capacity including the ramp processed 106,477 RPCs. A further 33,782 requests ran through all three market cutoffs/reference points, an intentional service restart, midnight payout, and week/month rollover. All ten boundary checkpoints and the independent SQLite oracle passed: 216 payout receipts, zero frozen balance after settlement and zero accounting differences. Fourteen focused checks plus historical replay/authentication checks after rollover passed. An intentionally lost vote response replayed with zero second spend. After quiescing and freezing the private clock, another restart preserved the financial digest and every sealed archive fingerprint.

The intentional single-process restart had an approximately 1.15-second unavailability interval: 25 HTTP 502 responses (UK 11, Shanghai 14), all inside that window, with none outside. The raw errors and SSE disconnect/retry counters are retained. A CPU/RAM upgrade does not remove that maintenance window; future smooth deployment must preserve one authoritative ledger writer and idempotent recovery.

NIC TX/RX was 727.5/123.7 MiB for the capacity window and 160.2/37.7 MiB for settlement. Both directions, cumulative counters, retransmissions and queue metrics are retained per second. The live dashboard additionally counts management/archive transfers after the test windows, so its running total is a different scope and is not a CDT invoice.

## Operational handover

The frozen synthetic ledger is retained separately and its accelerated service is disabled. A fresh manual-test database uses the real business clock through an IP-restricted internal endpoint. It does not inherit the old manual-test balances. The original services and backup seed remained unchanged; current-service snapshots and the complete historical backup export are preserved privately, with matching source/local/new-host checksums. Old test entries must stop receiving new writes before the user retires that host; these are point-in-time archives, not continuous replication.

No primary traffic or DNS was switched. The production service remains at its existing `1.2.0-u2 / 2f2d6e3` receipt. A later production move still requires a fresh primary snapshot, matching-version restore verification, a single-writer final sync and explicit cutover scope. Returning after new writes requires carrying the latest acknowledged ledger, not stale DNS failback.

## Limits and next resource decision

The current two-vCPU/four-GiB configuration is sufficient for this measured 200-user workload. The nearest resource limit is the configured 10-Mbps network ceiling, not CPU or RAM. Linear extrapolation from the observed mean gives about 11.7 Mbps at 400 users; this is an estimate, not a 400-user measurement or availability guarantee. If sustained 400 becomes necessary, increase the network allowance first and retest before buying more compute.

The frozen readiness source does not include the communication branch's later `c72e7b5` serialization, fanout-budget and Host cold-read coalescing/fencing changes. The chief engineer was notified to retain/review those changes during subsequent integration. These results must not be presented as a strict same-source A/B against that branch.

Private reports retain raw client/traffic traces, test fixtures, standalone charts and the ledger oracle. No addresses, credentials, real ledgers or those private artifacts are committed here.
