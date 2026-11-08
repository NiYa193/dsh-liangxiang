# ECS isolated validation

Freeze business implementation at alpha.12 / `1879c10`. The validation branch adds deployment guard support only; it does not change the plugin, ledger or transport contract.

A standby may use the exact hostname `liangxiang` when its explicit deployment role is `standby`. Before upload, the active Caddy service must use `Caddyfile.standby`, and the generic host must contain `/etc/liangxiang-deploy-role`: a regular, non-symlink file owned by root with mode 0600 and content `standby`. Isolated installers recheck the marker. A production role cannot use this generic name. Existing role-bearing hostnames retain their checks.

Validation uses an empty independent rehearsal ledger and synthetic identities. The ordinary production ledger, prior standby and original backups are outside this deployment. A private business clock covers market boundaries without changing the OS clock. Public DNS and production routing remain unchanged.

Pending remote evidence: hardening, TLS, two-origin 200-client capacity, settlement, recovery and archival before retiring the former standby.
