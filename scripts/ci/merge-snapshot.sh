#!/usr/bin/env bash
set -euo pipefail
[[ "${BASE_SHA:-}" =~ ^[0-9a-f]{40}$ && "${HEAD_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || {
  echo 'Expected two complete commit SHAs' >&2; exit 2;
}
[[ "$(git rev-parse HEAD)" == "$BASE_SHA" ]] || {
  echo 'Checkout does not match the frozen main commit' >&2; exit 2;
}
git fetch --no-tags origin "$HEAD_SHA"
git -c core.hooksPath=/dev/null -c user.name=liangxiang-ci \
  -c user.email=ci@users.noreply.github.com merge --no-ff --no-commit "$HEAD_SHA"
{
  echo "### Frozen integration tree"
  echo "- main: $BASE_SHA"
  echo "- dev: $HEAD_SHA"
  echo "- Tested tree: $(git write-tree)"
} >> "$GITHUB_STEP_SUMMARY"
