---
kind: package-library
description: "Preserve V4 Session bodies in a V5 generation with header-level old-reader refusal."
---

# Session V4 to V5

English | [中文](README.zh.md)

## Summary

This adjacent library upgrades only the header version. Old V4 readers reject V5 before reading or repairing a body. The [format authority](../../../docs/session-format-status.md) distinguishes the current writer from accepted and published versions.

## Conversion and admission

| Data | V4→V5 rule |
|---|---|
| Header | Require the retained V4 logical fields, change `version` from 4 to 5, preserve every other field. |
| All admitted events | Preserve type, seq, time, ids, payloads, surface placement, source-event references and ordering. No event is dropped or inserted. |
| Messages | Preserve roles, content, ids, source kinds including old title spellings, optional references and opaque metadata. No request text changes. |
| Inheritance | Preserve the exact logical cut; obtain a missing cut from the final inherited end-seed marker. Refuse inconsistent or absent markers. |
| Plugin and unknown events | Preserve unknown ignorable records under their exact names. Refuse unknown required source names against the captured V4 set, which includes the local RAG records in the [outgoing archive](../../../docs/persistence-changes/historical-formats/v4.md). |
| Delivery coordinates | Preserve old generation values and seq references. Validate V4 source ownership and refuse a source marker claiming target V5. Native V5 validates only active V5 delivery ownership. |

Source decoding reuses the unchanged released V4 codec. Each independent Stage emits identity events and retains their references until EOF for complete V4 relationship validation. It accepts compact runs by iteration without an intermediate expansion array. There are no external prerequisites for this edge; earlier V3→V4 conversion still requires child evidence. Strict catalog restoration additionally applies installed current Session validation before publication.

Native V5 framing delegates unchanged row and message rules to the retained V4 codec. Native V5 metadata uses the same fields with version 5. The V5 restorer supplies a validation-only header/delivery view to the retained V4 relationship validator, then returns the original artifact without changing any event. Unknown required physical rows are refused before the current JSONL scanner can discard a recoverable suffix, including compressed input. Unknown ignorable payloads retain their established uninterpreted behavior.

Read-open prepares conversion without publishing. Write-open uses the existing verified successor publication path before append; predecessors retain their path, bytes and inode. Highest-generation selection never falls back to V4 on V5 refusal or corruption. The catalog supplies a fixed V4 prerequisite reader for historical child discovery.

## Model Experience

### Restored requests

#### What the model sees

The original recorded messages, `source.kind` and `TextBlock.reference` values remain unchanged; this library adds no model-visible input.

#### Token effect

Conversion changes no request text or token-bearing data.

#### KV Cache effect

Conversion preserves the recorded request prefix. Provider cache availability and eviction remain external.

## Known Limitations and Deferred Work

- **Historical admission** — Historical representations outside the captured source names or retained V4 body rules fail without changing the source or publishing a successor. Source relationship validation retains event references until EOF. A format archive records a schema checkpoint, not every same-version representation or proof of publication. Real provider quality and production acceptance are outside this library.

### Dev Note

None.
