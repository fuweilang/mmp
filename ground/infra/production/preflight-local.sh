#!/usr/bin/env bash
# Local, read-only assertions on a prepared release directory.
# Dual-Mac aware: expects darwin-arm64 + darwin-amd64 by default; Windows entries are
# never required, never removed, and are only checked for file presence when declared.
set -euo pipefail
RELEASE_DIR="${1:?Usage: preflight-local.sh /absolute/release/directory}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Comma-separated expected mac platform keys. Default requires both Mac architectures.
EXPECTED_MAC="${MMP_PREFLIGHT_MAC_PLATFORMS:-darwin-arm64,darwin-amd64}"
export EXPECTED_MAC
for file in compose.yml production.env.example nginx-mmai.conf proxy-common.conf init-db.sh middle-web.tar.gz; do
  test -s "$RELEASE_DIR/$file" || { echo "Missing $file" >&2; exit 1; }
done
# Production SMS is fail-closed: the template must carry every SMS key, and an actual
# production.env (when present) must use the real Tencent channel with real credentials.
node "$SCRIPT_DIR/check-sms-env.mjs" "$RELEASE_DIR/production.env.example" --template \
  || { echo "production.env.example is missing SMS keys" >&2; exit 1; }
if [[ -s "$RELEASE_DIR/production.env" ]]; then
  node "$SCRIPT_DIR/check-sms-env.mjs" "$RELEASE_DIR/production.env" --runtime \
    || { echo "production.env is not production-ready for SMS" >&2; exit 1; }
fi
node - "$RELEASE_DIR" <<'JS'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const dir = process.argv[2], read = f => fs.readFileSync(path.join(dir,f),'utf8');
if (/octop|mmPlatform|:8088/.test(read('compose.yml'))) throw new Error('Old runtime in deployment compose');
const manifestPath = path.join(dir,'downloads/mammoth-latest.json');
if (!fs.existsSync(manifestPath)) {
  console.log('No client release this round; skipping installer assertions');
  process.exit(0);
}
const manifest = JSON.parse(read('downloads/mammoth-latest.json'));
if (manifest.product !== 'mammoth-agent' || manifest.schema_version !== 2) throw new Error('Unexpected product manifest');
const platforms = manifest.platforms || {};
const expected = String(process.env.EXPECTED_MAC || 'darwin-arm64,darwin-amd64').split(',').map(s => s.trim()).filter(Boolean);
for (const key of expected) {
  if (!platforms[key]) throw new Error(`Missing expected platform entry: ${key}`);
}
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const [key, entry] of Object.entries(platforms)) {
  if (!entry || typeof entry.file !== 'string') throw new Error(`Platform ${key} has no file`);
  if (/[\\/]/.test(entry.file) || entry.file.includes('..')) throw new Error(`Platform ${key} has an unsafe file name`);
  const target = path.join(dir, 'downloads', entry.file);
  // Windows entries may point at assets intentionally kept out of this release snapshot.
  if (!fs.existsSync(target)) {
    if (key === 'windows-amd64') { console.log(`windows-amd64 entry preserved without local file (${entry.file}); no deletion performed`); continue; }
    throw new Error(`Missing installer for ${key}: ${entry.file}`);
  }
  const size = fs.statSync(target).size;
  if (entry.bytes !== undefined && Number(entry.bytes) !== size) throw new Error(`${key} size mismatch: manifest ${entry.bytes} vs disk ${size}`);
  if (entry.sha256) {
    const actual = sha256(target);
    if (actual !== entry.sha256) throw new Error(`${key} sha256 mismatch`);
  }
}
console.log(`Routing/config and installer preflight passed for: ${expected.join(', ')}`);
JS
