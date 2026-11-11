---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-10-official-expert-knowledge

English | [中文](2026-11-10-official-expert-knowledge.zh.md)

## Summary

Advances the Session writer from V4 to V5 for required official expert, gallery and knowledge evidence. Adds an identity body conversion and native V5 admission while retaining optional Library references and historical title-source spellings. The earlier literal and finalization-domain restorations leave accepted digests and checkpoints unchanged.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-official-expert-knowledge
baseline: false
changes:
  - root: "JsonlHeaderLine"
    previous: "2026-09-11-initial"
    after: "dd498b6fce7c7a0258d68c99d24e522dacdffd8cae534a63cc7991808d59b1d9"
    decision: version-bump
  - root: "SessionHeader"
    previous: "2026-09-16-session-format-v4"
    after: "22c6899a78214dd841c266348ae997027ef391174ddb21127f1b71dc1b362824"
    decision: version-bump
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "5ffefdd4271e74cc13b7689e476aea129ba5d60ac19e89068757f916c677a0bb"
    decision: version-bump
  - root: "event:assistant/attempt"
    previous: "2026-09-16-session-format-v4"
    after: "9f015952f38c672be8e26e4b5122cbed01d4eb67632c4cf26535486be0f4af42"
    decision: version-bump
  - root: "event:assistant/message"
    previous: "2026-09-16-session-format-v4"
    after: "e28c7c7389cdad7cb1c2e70c8dc601ea7fe42567d6abdcf8c06519193c9fccea"
    decision: version-bump
  - root: "event:compaction/summary"
    previous: "2026-09-16-session-format-v4"
    after: "aacbf02ae1aefc458e88a072e75caba1980e59118159cbafa8dd07a5f671d847"
    decision: version-bump
  - root: "event:developer/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "d051c01264c55963d57369a817d37c80f4ff0e3d160da01d9dea490133b139aa"
    decision: version-bump
  - root: "event:official-agent/bound"
    previous: null
    after: "54ecf97a058fe0f76babc8eeb831cfbed140f7d34951f394c623d831190e8550"
    decision: version-bump
  - root: "event:official-agent/knowledge"
    previous: null
    after: "717647cef155fed2dd95871c28fca9a27d3734b83b52ac291121bcabb7eb489d"
    decision: version-bump
  - root: "event:official-gallery/artifact"
    previous: null
    after: "24a686c65b6d7a102392380299db74ba1ee83816673cbcaceb3fbd62278ad256"
    decision: version-bump
  - root: "event:official-gallery/attempt"
    previous: null
    after: "dde85adc136b2ee03b595d611286ad4a55568eca6a1a91bf3c5e019b62d4d085"
    decision: version-bump
  - root: "event:official-gallery/attempt-start"
    previous: null
    after: "d8ea0e46117898bf37a0226fc86c90e46ef1e5456cfc581b5253cf5a047927e6"
    decision: version-bump
  - root: "event:official-gallery/composition"
    previous: null
    after: "faef4f599756d8c0fba47e10e596664ad7581f58808c88422b5c348d70cd8a26"
    decision: version-bump
  - root: "event:official-gallery/receipt"
    previous: null
    after: "2bbda8fc1c9fb8dc831b7451b07fb3c0daaa5c5ad830968fda0bac2d3ffb5c93"
    decision: version-bump
  - root: "event:official-gallery/source"
    previous: null
    after: "839b8efe978262d1b952284aed2f2b777f6149a0534fd8bb01dbab958ab09942"
    decision: version-bump
  - root: "event:official-skill/bound"
    previous: null
    after: "ef12505e392a725c334441c001f3825cb9e95cf1fb50bfbaa7061428c18aa810"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "6e69ff57747c05d1d873f494e6027e9235401087b6025988d3931b0b7af805e5"
    decision: version-bump
  - root: "event:system/message"
    previous: "2026-09-16-session-format-v4"
    after: "2f77529cdc90bf62d7ff54b91ebed642d087a677e396ba27ddc607d37f96bf46"
    decision: version-bump
  - root: "event:team/message/queued"
    previous: "2026-09-16-session-format-v4"
    after: "c8a39690de7eec986748da1d940895f6c00c01f4fcaf4eb160de84d44d2af7cf"
    decision: version-bump
  - root: "event:tool/ptc-dispatch"
    previous: "2026-10-05-ptc-operation-metadata"
    after: "b23bd861e6700e3a3b1f38a12cebe4d9cd79e86cb71279db5218b304421db8b4"
    decision: version-bump
  - root: "event:tool/result"
    previous: "2026-09-16-session-format-v4"
    after: "45c090ae794957a480b9ef98db5e8d1df234b432d40af5b8f0dcc156ceb97078"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "82b42620a050367f8e464ef5d5d42264ec569c4b9829ae366d18f252dd25e80d"
    decision: version-bump
```

<a id="compatibility"></a>
## Compatibility

The captured prior built V4 JSONL reader rejects V5 at the header before body recovery, for raw and Zstandard input, including a malformed prefix followed by required knowledge data. Highest-generation selection never falls back to V4. The previous same-version claim was insufficient: an older V4 scanner can suppress an unknown required event after earlier corruption. The adjacent V4→V5 edge preserves admitted event sequence, ids, messages, sources, references, opaque ignorable records and inherited cuts, including valid temporary local V4 RAG records. Unknown required V4 source names and source delivery markers claiming active target V5 are explicitly refused without source mutation; V3 inputs carrying such future V5 markers also refuse through the chain. Native V5 checks unknown required rows before recoverable-tail suppression. A read-open prepares history without publication; write-open verifies and publishes the final V5 successor before append, retaining predecessor bytes, path and inode. Fixed V4 child prerequisite reads remain independent of the current writer. No earlier codec, accepted record, finalization checkpoint or publication record is rewritten. Application and SQLite versions remain unchanged.

<a id="verification"></a>
## Verification

Executed focused V5/catalog/JSONL admission and owner-only endpoint suites: 71 passed. Strict restoration tests cover generations 0 through 5 and seeded cuts; disk tests cover raw/Zstandard read preparation, publication before append, V4 byte/hash/inode preservation, native V5 reopen and no fallback. A captured immutable prior built V4 reader completed 8 raw/Zstandard × header-only/highest-generation × read/write refusal cases without byte or inode mutation. Keyless TypeScript SDK text-turn and official-expert-knowledge replay: 2 passed; the official expert Python SDK smoke passed after successor refresh and again without write-back. The corpus check passed 3 cases. These are local synthetic-provider checks, not real-provider, production or UI acceptance. The broader documentation check remains separately reported; no full Harness suite was run.

<a id="dev-note"></a>
## Dev Note

None.
