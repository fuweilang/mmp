# Agent Note: Desktop account data homes

Status: implemented

English | [中文](2026-11-04-desktop-account-data.zh.md)

## Problem

Changing the active login credential did not change Desktop's session and workspace storage roots. Different users on one OS login therefore saw the same local history.

## Decision

Scope the complete Host data home by verified issuer, enterprise and user identity. The provider resolves the profile before publishing private identity to Electron; the grant's enterprise claim is used only together with that verified profile. Hash the identity rather than persisting credentials in paths. Electron destroys the old renderer, stops the old Host, clears application browser storage and starts the target data home serially. Outgoing Host notifications cannot change the replacement's identity. Missing identity uses an independent signed-out home and retries profile discovery.

Keep deployment configuration and login storage at their installation locations. A final launcher overlay pins sessions, domain stores, attachments and default workspace files to the selected home. Leave legacy history unassigned: the previous shared directory contains no reliable account ownership evidence. The [upgrade guide](../../../../docs/upgrade-guide/v0.2.2-alpha.2/desktop-account-data/guide.md) describes this behavior. The existing [embedded Platform browser storage](2026-09-22-platform-browser-storage.md) policy remains independently owned; this decision concerns Host task data and the application document.

## Verification

Focused tests cover identity keys, enterprise changes, account switching and restoration, stop failures, stale notifications, retrying identity discovery, launcher roots and preservation of unowned history. Main-process integration checks destroy-before-restart ordering.
