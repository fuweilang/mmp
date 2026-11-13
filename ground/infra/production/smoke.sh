#!/usr/bin/env bash
# Read-only checks after deployment; does not register users, consume credit, or change a server.
# Routing model: / = official site (static), /agent/ = agent web, /console//admin/ = middle platform.
# Download checks perform real GETs and verify byte size + sha256 for every platform in the manifest.
# MMP_SMOKE_SKIP_DOWNLOAD_HASH=1 skips only the sha256/hash of large installers (still real GET + size).
set -euo pipefail
ORIGIN="${1:-https://www.mmai.vip}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail() { echo "$*" >&2; exit 1; }
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }

curl --fail --silent --show-error "$ORIGIN/api/health" >/dev/null
for route in /login /console/ /admin/; do curl --fail --silent --show-error --max-time 20 "$ORIGIN$route" >/dev/null; done

# 根路径必须是官网，而不是 agent 应用壳、也不是 303 到登录。
[[ "$(http_code "$ORIGIN/")" == 200 ]] || fail "Root / must serve the official site, got $(http_code "$ORIGIN/")"
root_html="$(curl --fail --silent --show-error --max-time 20 "$ORIGIN/")"
case "$root_html" in
  *打开就能用专家干活*) ;;
  *) fail 'Root / is not the official site (missing hero copy)' ;;
esac
asset="$(printf '%s' "$root_html" | grep -oE '/_next/static/[^" ]+\.(css|js)' | head -1 || true)"
[[ -n "$asset" ]] || fail 'Official site HTML references no /_next/static asset'
curl --fail --silent --show-error --max-time 20 -o /dev/null "$ORIGIN$asset"
for route in /privacy /logo.webp; do curl --fail --silent --show-error --max-time 20 -o /dev/null "$ORIGIN$route"; done
echo "official site check ok"

# /agent 必须是 301 → /agent/，匿名 /agent/ 必须 303 到登录并把 next 带回 /agent/。
code="$(http_code "$ORIGIN/agent")"
[[ "$code" == 301 || "$code" == 302 ]] || fail "/agent must redirect to /agent/, got $code"
location="$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 20 "$ORIGIN/agent")"
case "$location" in
  */agent/) ;;
  *) fail "/agent redirected to $location, expected /agent/" ;;
esac
agent_probe="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$ORIGIN/agent/")"
code="${agent_probe%% *}"
location="${agent_probe#* }"
[[ "$code" == 303 ]] || fail "Anonymous /agent/ must return 303 to login, got $code"
case "$location" in
  */login?next=*agent*) ;;
  *) fail "Anonymous /agent/ login redirect lost its return path: $location" ;;
esac
# 智能体在根上的绝对路由不能被官网 404 吃掉。
code="$(http_code "$ORIGIN/plugins/")"
[[ "$code" == 401 || "$code" == 403 ]] || fail "/plugins/ must reach the agent bridge (401/403), got $code"
echo "agent entry check ok"

if [[ "$(http_code "$ORIGIN/downloads/mammoth-latest.json")" == 200 ]]; then
  missing="$(http_code "$ORIGIN/downloads/not-an-installer.exe")"
  [[ "$missing" == 404 ]] || fail "Missing downloads must return 404, got $missing"
  curl --fail --silent --show-error -o "$TMP/mammoth-latest.json" "$ORIGIN/downloads/mammoth-latest.json"
  node -e '
const m = require(process.argv[1]);
if (m.product !== "mammoth-agent" || m.schema_version !== 2) { console.error("bad manifest"); process.exit(1) }
const keys = Object.keys(m.platforms || {});
if (!keys.includes("darwin-arm64") || !keys.includes("darwin-amd64")) { console.error("manifest must list both Mac architectures: " + keys.join(",")); process.exit(1) }
for (const k of keys) if (!m.platforms[k] || typeof m.platforms[k].file !== "string") { console.error("bad entry " + k); process.exit(1) }
' "$TMP/mammoth-latest.json"
  while IFS=$'\t' read -r key file wantSha wantBytes; do
    [[ -n "$file" ]] || continue
    echo "download check: $key $file"
    code="$(curl -s -o /dev/null -w '%{http_code}' -r 0-0 --max-time 30 "$ORIGIN/downloads/$file")"
    [[ "$code" == 200 || "$code" == 206 ]] || fail "GET /downloads/$file returned $code"
    curl --fail --silent --show-error --location --max-time 900 -o "$TMP/$file" "$ORIGIN/downloads/$file"
    actualBytes="$(wc -c < "$TMP/$file" | tr -d ' ')"
    if [[ -n "$wantBytes" && "$wantBytes" != "null" && "$wantBytes" != "$actualBytes" ]]; then
      fail "$key size mismatch: manifest $wantBytes vs served $actualBytes"
    fi
    if [[ "${MMP_SMOKE_SKIP_DOWNLOAD_HASH:-0}" != "1" && -n "$wantSha" && "$wantSha" != "null" ]]; then
      actualSha="$(shasum -a 256 "$TMP/$file" | awk '{print $1}')"
      [[ "$actualSha" == "$wantSha" ]] || fail "$key sha256 mismatch: manifest $wantSha vs served $actualSha"
    fi
  done < <(node -e '
const m = require(process.argv[1]);
for (const [k, v] of Object.entries(m.platforms || {})) console.log([k, v.file, v.sha256 ?? "", v.bytes ?? ""].join("\t"))
' "$TMP/mammoth-latest.json")
  # Per-architecture update feeds are optional this round; when present their referenced binaries must resolve.
  for arch in arm64 x64; do
    feed="$ORIGIN/downloads/mmp-desk/feeds/mac-$arch/latest-mac.yml"
    if [[ "$(curl -s -o "$TMP/feed-$arch.yml" -w '%{http_code}' --max-time 20 "$feed")" == 200 ]]; then
      node -e '
const fs=require("fs");const t=fs.readFileSync(process.argv[1],"utf8");
const m=t.match(/^path:\s*(.+)$/m);if(!m){console.error("feed has no path");process.exit(1)}
const p=m[1].trim();if(!/mmp-desk\//.test(p)&&p.includes("..")){console.error("bad feed path");process.exit(1)}
console.log(p)' "$TMP/feed-$arch.yml" > "$TMP/feedpath-$arch" || exit 1
      fpath="$(cat "$TMP/feedpath-$arch")"
      [[ "$fpath" == /* ]] || fpath="/$fpath"
      code="$(http_code "$ORIGIN$fpath")"
      [[ "$code" == 200 ]] || fail "feed $arch references missing $fpath ($code)"
      echo "feed check ok: mac-$arch"
    fi
  done
  # Fixed aliases must serve the same artifact as the manifest. Compares size only (cheap, catches the
  # "page shows the new version but the alias still holds the previous package" drift).
  for pair in "darwin-arm64:mammoth-agent-mac-arm64.dmg" "darwin-amd64:mammoth-agent-mac-x64.dmg" "windows-amd64:mammoth-agent-win.exe"; do
    key="${pair%%:*}"; alias_file="${pair#*:}"
    want="$(node -e 'const m=require(process.argv[1]);const p=m.platforms?.[process.argv[2]];if(p&&p.bytes!=null)console.log(p.bytes)' "$TMP/mammoth-latest.json" "$key")"
    [[ -n "$want" ]] || continue
    got="$(curl -sI --max-time 30 "$ORIGIN/downloads/$alias_file" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2; exit}')"
    if [[ -z "$got" ]]; then
      fail "alias /downloads/$alias_file is missing (manifest declares $key)"
    fi
    [[ "$got" == "$want" ]] || fail "alias $alias_file serves $got bytes, manifest declares $want for $key"
    echo "alias check ok: $alias_file ($got bytes)"
  done
else
  echo 'No client installer published this round; skipping download checks'
fi

# Ground public asset families must reach the API, not the agent RPC bridge (which answers 401).
for probe in /api/official-agents/avatars/boss.jpg /api/official-agents/avatars/copy.jpg; do
  code="$(http_code "$ORIGIN$probe")"
  [[ "$code" == 200 ]] || fail "Ground asset $probe returned $code (nginx API whitelist?)"
done
echo "Ground asset route check ok"

echo 'Public route/download smoke passed; authenticated two-account and desktop tests remain operator checks.'
