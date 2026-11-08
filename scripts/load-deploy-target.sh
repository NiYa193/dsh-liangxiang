# Sourced by both deployment commands. All destination checks precede writes.
DEPLOY_TARGET_CONFIG="$(node "$ROOT/scripts/deploy-target.mjs" config "$ROOT/.env")"
while IFS='=' read -r key value; do
  case "$key" in
    LIANGXIANG_DEPLOY_SSH) LIANGXIANG_DEPLOY_SSH="$value" ;;
    LIANGXIANG_DEPLOY_SSH_PORT) LIANGXIANG_DEPLOY_SSH_PORT="$value" ;;
    DEPLOY_ROLE) DEPLOY_ROLE="$value" ;;
    DEPLOY_EXPECTED_HOSTNAME) DEPLOY_EXPECTED_HOSTNAME="$value" ;;
    DEPLOY_HEALTH_URL) DEPLOY_HEALTH_URL="$value" ;;
  esac
done <<< "$DEPLOY_TARGET_CONFIG"
unset DEPLOY_TARGET_CONFIG key value
source "$ROOT/scripts/load-deploy-ssh.sh"

# Keep the heredoc outside a quoted command substitution: macOS Bash 3.2
# otherwise misparses the remote case statement before SSH receives it.
standby_proxy_check_script() {
  cat <<'PROXY_CHECK'
set -euo pipefail
CONFIG=/etc/caddy/Caddyfile.standby
if [[ "$(hostname)" == liangxiang ]]; then
  marker=/etc/liangxiang-deploy-role
  [[ -f "$marker" && ! -L "$marker" && "$(stat -c '%u:%a' "$marker")" == 0:600 && "$(cat "$marker")" == standby ]] || {
    echo "refusing deploy: generic hostname requires a root-owned standby role marker" >&2; exit 1;
  }
fi
for property in ExecStart ExecReload; do
  value="$(systemctl show caddy -p "$property" --value)"
  case "$value" in
    *"--config $CONFIG "*|*"--config=$CONFIG "*) ;;
    *) echo "refusing deploy: Caddy does not use the standby configuration" >&2; exit 1 ;;
  esac
done
sha256sum "$CONFIG" | cut -d ' ' -f 1
PROXY_CHECK
}

deploy_target_preflight() {
  local actual
  actual="$("${DEPLOY_SSH[@]}" -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" hostname)"
  node "$ROOT/scripts/deploy-target.mjs" hostname "$DEPLOY_EXPECTED_HOSTNAME" <<< "$actual"
  DEPLOY_STANDBY_PROXY_SHA="not-used"
  if [[ "$DEPLOY_ROLE" == standby ]]; then
    DEPLOY_STANDBY_PROXY_SHA="$(standby_proxy_check_script | "${DEPLOY_SSH[@]}" "$REMOTE" sudo -n bash -s)"
    if [[ ! "$DEPLOY_STANDBY_PROXY_SHA" =~ ^[a-f0-9]{64}$ ]]; then
      echo "refusing deploy: invalid standby proxy fingerprint" >&2
      exit 1
    fi
  fi
}

load_deploy_source_version() {
  local versions key value
  versions="$(node "$ROOT/scripts/deploy-target.mjs" versions "$ROOT/src/shared/index.ts")"
  while IFS='=' read -r key value; do
    case "$key" in
      PLUGIN_VERSION) PLUGIN_VERSION="$value" ;;
      SERVER_BUILD) SERVER_BUILD="$value" ;;
    esac
  done <<< "$versions"
}
