# Development startup repair

Goal: allow the root `dev:agent` and `dev:desktop` commands to start in either order, including simultaneous invocation, without concurrent writes to shared artifacts.

Use one short-lived startup lock per checkout. Build the complete artifact set before starting either application. Keep a live owner record for the agent watcher; a desktop launched while that watcher is active reuses those prepared artifacts through `start:desktop`. Duplicate agent invocations report the existing owner. Recover dead owner records. Forward shutdown to child process groups and release ownership after children exit. Preserve other workspace changes and do not automatically terminate an unidentified listener.

- [x] Add regression tests for simultaneous starts, both launch orders, duplicate agents, failed preparation, and stale ownership.
- [x] Add the root launch coordinator and connect the two package scripts; document ownership and direct-build limitations.
- [x] Stop the verified orphan Web router, run focused tests and the artifact/check builds, then launch both real commands and verify Web and Electron readiness.

Validation: 13 focused regressions pass, including cross-process locking, interrupted shutdown, and surviving writers after coordinator crashes. Independent review found no remaining important issue. Real full artifact build passed 8/8 gates; Web and Desktop launched in both orders. SIGTERM shutdown released ports 3080, 9229 and 9222 and removed watcher ownership. The existing Host aggregate type check fails at `packages/preset/official-agent-gallery/tests/sent-skills.spec.ts:45` because `skillMarks` is not in the declared type; no package sources were changed for this repair.
