#!/usr/bin/env bash
# Reset the desktop development installation to its first-run state:
# drop every stored credential (API key + account login) and clear the
# onboarding progress so the next launch opens the welcome window.
#
# Usage: bash scripts/reset-first-run.sh [--dry-run] [--force]
#   --dry-run  print the plan, change nothing
#   --force    run even while the desktop app is still open
#
# Quit the client first: it rewrites credentials while running.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MMP_HOME_DIR="${MMP_HOME:-$ROOT/apps/desktop/.desktop-build/development/home}"
CREDENTIALS="$MMP_HOME_DIR/.credentials.yaml"
PATCH="$MMP_HOME_DIR/profiles/desktop/cordis.patch.yml"
STAMP="$(date +%Y%m%d-%H%M%S)"

CREDENTIALS_BACKUP=
PATCH_BACKUP=
DRY_RUN=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    --force|-f) FORCE=1 ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "reset-first-run: unknown option $arg" >&2; exit 2 ;;
  esac
done

if [[ ! -d "$MMP_HOME_DIR" ]]; then
  echo "reset-first-run: no desktop home at $MMP_HOME_DIR (run pnpm dev:desktop once first)" >&2
  exit 1
fi

if [[ "$FORCE" -eq 0 ]] && pgrep -f "Harness Dev" >/dev/null 2>&1; then
  echo "reset-first-run: the desktop client is still running." >&2
  echo "  Quit it first (Cmd+Q), then rerun. Or pass --force to skip this check." >&2
  exit 1
fi

echo "home: $MMP_HOME_DIR"

drop_credentials() {
  if [[ ! -f "$CREDENTIALS" ]]; then
    echo "  credentials: already empty"
    return
  fi
  echo "  credentials: dropping $(grep -c 'kind:' "$CREDENTIALS" || true) grant(s) + stored refs"
  if [[ "$DRY_RUN" -eq 1 ]]; then return; fi
  cp -p "$CREDENTIALS" "$CREDENTIALS.bak-$STAMP"
  chmod 600 "$CREDENTIALS.bak-$STAMP"
  rm -f "$CREDENTIALS"
  CREDENTIALS_BACKUP="$CREDENTIALS.bak-$STAMP"
  echo "  credentials: backup at $CREDENTIALS_BACKUP"
}

reset_onboarding() {
  if [[ ! -f "$PATCH" ]]; then
    echo "  onboarding: no patch file, defaults already apply"
    return
  fi
  if ! grep -q '^- id: ui-settings-account$' "$PATCH"; then
    echo "  onboarding: no saved progress, defaults already apply"
    return
  fi
  echo "  onboarding: removing saved ui-settings-account progress (step: done)"
  if [[ "$DRY_RUN" -eq 1 ]]; then return; fi
  cp -p "$PATCH" "$PATCH.bak-$STAMP"
  chmod 600 "$PATCH.bak-$STAMP"
  python3 - "$PATCH" <<'PY'
import sys
import yaml

path = sys.argv[1]
lines = open(path, encoding='utf-8').read().splitlines(keepends=True)
kept, skipping = [], False
for line in lines:
    if line.startswith('- id: ui-settings-account'):
        skipping = True
        continue
    if skipping and line.startswith('- id: '):
        skipping = False
    if not skipping:
        kept.append(line)
text = ''.join(kept)
yaml.safe_load(text)  # fail loud rather than write a broken profile
with open(path, 'w', encoding='utf-8') as handle:
    handle.write(text)
PY
  PATCH_BACKUP="$PATCH.bak-$STAMP"
  echo "  onboarding: backup at $PATCH_BACKUP"
}

drop_credentials
reset_onboarding

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry run: nothing changed. Rerun without --dry-run to apply."
  exit 0
fi

cat <<EOF

done. Next:
  1. pnpm dev:desktop
  2. The welcome window opens: sign in, paste an API key, or skip.

Restore later (only if you want the old state back):
$([[ -n "$CREDENTIALS_BACKUP" ]] && echo "  cp $CREDENTIALS_BACKUP $CREDENTIALS")
$([[ -n "$PATCH_BACKUP" ]] && echo "  cp $PATCH_BACKUP $PATCH")
EOF
