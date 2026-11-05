#!/usr/bin/env bash
set -euo pipefail
RELEASE_DIR="${1:?Usage: preflight-local.sh /absolute/release/directory}"
for file in compose.yml production.env.example nginx-mmai.conf proxy-common.conf init-db.sh middle-web.tar.gz; do
  test -s "$RELEASE_DIR/$file" || { echo "Missing $file" >&2; exit 1; }
done
node - "$RELEASE_DIR" <<'JS'
const fs = require('node:fs'), path = require('node:path');
const dir = process.argv[2], read = f => fs.readFileSync(path.join(dir,f),'utf8');
if (/octop|mmPlatform|:8088/.test(read('compose.yml'))) throw new Error('Old runtime in deployment compose');
const manifestPath = path.join(dir,'downloads/mammoth-latest.json');
if (!fs.existsSync(manifestPath)) {
  console.log('No client release this round (Octop client removed); skipping installer assertions');
} else {
  const manifest = JSON.parse(read('downloads/mammoth-latest.json'));
  if (manifest.product !== 'mammoth-agent' || manifest.schema_version !== 2 || !manifest.platforms?.['darwin-arm64']) throw new Error('Missing new Apple Silicon product manifest');
  if (!fs.existsSync(path.join(dir,'downloads/mammoth-agent-mac-arm64.dmg'))) throw new Error('Missing Apple Silicon installer');
  for (const key of ['windows-amd64','darwin-amd64']) if (manifest.platforms[key]) throw new Error('This release is Apple Silicon only; remove stale platform entries');
  console.log('Routing/config and Apple Silicon artifact preflight passed');
}
JS
