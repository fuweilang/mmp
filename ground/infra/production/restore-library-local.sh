#!/bin/sh
# Intentionally refuses production and existing destinations.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
exec node "$root/scripts/library-backup.mjs" restore "$@"
