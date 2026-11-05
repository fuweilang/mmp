#!/usr/bin/env bash
# Read-only checks after deployment; does not register users, consume credit, or change a server.
set -euo pipefail
ORIGIN="${1:-https://www.mmai.vip}"
curl --fail --silent --show-error "$ORIGIN/api/health" >/dev/null
for route in /login /console/ /admin/; do curl --fail --silent --show-error "$ORIGIN$route" >/dev/null; done
status="$(curl -s -o /dev/null -w '%{http_code}' "$ORIGIN/agent")"
[[ "$status" == 410 ]] || { echo "Old /agent should return 410, got $status" >&2; exit 1; }
if [[ "$(curl -s -o /dev/null -w '%{http_code}' "$ORIGIN/downloads/mammoth-latest.json")" == 200 ]]; then
  missing="$(curl -s -o /dev/null -w '%{http_code}' "$ORIGIN/downloads/not-an-installer.exe")"
  [[ "$missing" == 404 ]] || { echo 'Missing downloads must return 404' >&2; exit 1; }
  curl --fail --silent --show-error "$ORIGIN/downloads/mammoth-latest.json" | node -e '
let raw=""; process.stdin.on("data",x=>raw+=x).on("end",()=>{const v=JSON.parse(raw);if(v.product!=="mammoth-agent"||v.schema_version!==2||!v.platforms?.["darwin-arm64"])process.exit(1)})'
  curl --fail --silent --show-error --head "$ORIGIN/downloads/mammoth-agent-mac-arm64.dmg" >/dev/null
else
  echo 'No client installer published this round; skipping download checks'
fi
# Anonymous Web must land at the shared login, not return the old marketing site.
curl --fail --silent --show-error --location "$ORIGIN/" | grep -q '猛犸'
echo 'Public route/download smoke passed; authenticated two-account and desktop tests remain operator checks.'
