---
kind: upgrade-guide
description: "Desktop account histories move from shared local data to isolated issuer, enterprise and user data homes."
---

# Desktop account data isolation

English | [中文](guide.zh.md)

## Change

Desktop uses `$MMP_HOME/desktop-accounts/<identity-hash>` for each verified issuer, enterprise and user. Sessions, project registrations, attachments and default workspace files are isolated together. Switching accounts stops the previous Host, clears the application document and browser storage, then starts the selected account's Host. Returning to the same account restores its local history. This does not add cloud synchronization.

Previously Desktop read the shared `$MMP_HOME/sessions` and `$MMP_HOME/storages` directories. Those files and existing project folders remain untouched, but are not automatically assigned to the next person who logs in. Signed-out launches use separate bootstrap data homes. Login credentials and deployment configuration retain their shared installation location.

## Migration

1. Install the updated Desktop application and sign in. New account-owned data is created automatically; no configuration change is needed.
2. Confirm that a new session and project created under account A do not appear after signing in as account B. Return to A and restart Desktop to confirm A's history remains available.
3. Keep existing `$MMP_HOME/sessions`, `$MMP_HOME/storages` and project folders intact. If old history is needed, establish its ownership before planning a separate migration; do not copy the shared stores wholesale into an arbitrary account directory.
