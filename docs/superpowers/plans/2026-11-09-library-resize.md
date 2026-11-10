# Library resize implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this small change inline.

**Goal:** Resize the library directory and retain its width on this device.

**Architecture:** A local useLibrarySidebarResize behavioral hook owns Pointer and keyboard interaction and local storage. LibraryPanel supplies its label and applies the width through a CSS variable; CSS clamps the effective width on narrower containers.

**Tech Stack:** Existing React, TypeScript, CSS Modules and Vitest.

**Spec:** ../specs/2026-11-09-library-resize-design.md

## Global constraints

280px default; 200–480px range; 16px arrow steps; no automatic collapse; retain mobile vertical layout; no dependency changes, commits or release.

## Review focus

Lost pointer capture, cancellation/unmount selection cleanup, restricted/invalid local storage, responsive width protection, preserving existing dirty library edits.

## Task 1: Directory separator

**Files:** Create useLibrarySidebarResize.ts in ui-enterprise-library; modify LibraryPanel.tsx, LibraryPanel.module.css, locales.ts, panel.client.spec.tsx and package README.

**Interfaces:** useLibrarySidebarResize returns width/style, local layout refs and accessible separator props. It initializes stored/default width, persists at interaction completion, and owns temporary document styles. No effect synchronizes render state into a parent setter.

- [x] Add behavior tests and observe failure for missing separator.
- [x] Implement component, integrate panel/CSS/locales, document current behavior.
- [x] Run focused resize and library package tests; inspect diff; run build:artifacts then build:check; report failures separately.

Ruling: execute in the existing working checkout to retain the substantial ongoing library implementation used by the screenshot; preserve all unrelated edits and do not commit.

Review: fixed the first keyboard decrement after responsive narrowing, using visible pixels; injected measurement owns ResizeObserver and supplies ARIA readout. Independent rereview found no further scoped defects. Current library package78 tests, artifact build8 gates and aggregate check2 gates pass. Application browser acceptance is currently blocked by concurrent document-preview relative chunk loading; see the report.
