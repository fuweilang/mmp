---
kind: upgrade-guide
description: "Session writes publish V5 generations that older V4 readers cannot open."
---

# Upgrade Session storage to V5

## Change

The writer advances from Session format 4 to 5 so older readers reject new required expert evidence at the header before any tail recovery. Application and SQLite versions are unchanged. Read-only opens can prepare old histories in memory; write-open publishes a verified `session.v5.jsonl` or `session.v5.jsonl.zstd` before appending. Existing generations retain their paths and bytes. See the [compatibility acknowledgement](../../../persistence-changes/2026-11-10-official-expert-knowledge.md).

## Migration

1. Stop all processes using the target Session root, then upgrade every process that shares it to a V5-capable build.
2. Open an existing Session normally. Its first write publishes V5 through the adjacent migration chain; no bulk header editing is required. Retain all older files.
3. Confirm the Session reopens and its directory contains a version-named V5 successor alongside the predecessor. If conversion refuses unsupported historical data, keep the original files and report the diagnostic; no partial successor is published.
4. Use V5-capable readers thereafter. Older readers do not fall back to V4 when V5 exists, and editing or deleting the newer generation is not a supported downgrade.
