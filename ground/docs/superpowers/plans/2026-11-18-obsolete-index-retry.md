# Obsolete index retry compatibility

Retrying a failed/cancelled job whose parser or chunker version is obsolete must create/reuse a current immutable index and a new job. Preserve original bytes and valid preparation parameters, choose PDF automatic detection for old implicit text settings, and never overwrite old index identity. Use a stable upgrade idempotency key and fence document selection against a stale retry superseding newer content. Current-version failures keep existing in-place retry/checkpoint behavior. Display a clear compatibility message instead of a raw technical code.

- [x] Add regression tests for old-version retry, repeated retry, current-version retry and superseded document selection.
- [x] Implement current-index upgrade with guarded/idempotent acceptance.
- [x] Verify a local copy of the user's PDF seeded as INDEX_VERSION_UNSUPPORTED through retry, real Linux queue, persisted vectors and recall; no publication or source-database writes.
- [x] Run focused tests and builds, review and capture local UI evidence.
