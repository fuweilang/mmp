#!/bin/sh
# Authoring this script does not authorize running a production maintenance window.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
exec node "$root/scripts/library-backup.mjs" backup "$@"
