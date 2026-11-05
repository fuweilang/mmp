#!/usr/bin/env bash
# Print SSOT product version (x.y.z) from ground/config/version.json.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GROUND_ROOT="${GROUND_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
VJ="${1:-$GROUND_ROOT/config/version.json}"
if [[ ! -f "$VJ" ]]; then
  echo "resolve-mammoth-version: missing $VJ" >&2
  exit 1
fi
python3 - "$VJ" <<'PY'
import json, re, sys
path = sys.argv[1]
v = str(json.load(open(path)).get("version", "")).strip()
if not re.fullmatch(r"\d+\.\d+\.\d+", v):
    print(f"resolve-mammoth-version: bad version {v!r} in {path}", file=sys.stderr)
    sys.exit(1)
print(v)
PY
