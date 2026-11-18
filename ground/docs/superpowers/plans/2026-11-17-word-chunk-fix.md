# Word paragraph grouping and recall validation

Goal: implement the user's approved fix locally, with no publication or database reprocessing writes.

Approach: group consecutive Word paragraphs within the same heading, retaining explicit paragraph offsets and adding canonical paragraph separators. Split by target with hard maximum and overlap, preferring paragraph boundaries when they fit. Preserve headings, canonical source ranges and start/end paragraph locators. Bump parser/chunker versions so immutable old indexes are not reused. Existing PDF/page and table fences remain intact.

- [x] Add failing real-DOCX regression tests for grouping, parameter sensitivity, maximum, overlap and source/heading locators.
- [x] Implement parser grouping and boundary selection; update version identity.
- [x] Compare actual uploaded source.docx before/after with multiple configurations; validate source coverage and locators.
- [x] Exercise recall using real retrieval orchestration and local isolated candidates, explicit expected source facts and negatives. Distinguish lexical/local-adapter evidence from real embedding-provider acceptance.
- [x] Run knowledge core/retrieval tests, typechecks and isolated build (never clear a live watcher output directory). Review, browser preview acceptance and health checks. No commit/push/deploy.

Results: Word before457 vs after28/24/49 chunks; max300→210 caps longest222→209; overlap0/80/160 yields27/28/29 chunks. Production chapter-context BGE-M3 embedding + retrieval orchestration:8/8 expected-fact hits for old and all3 new configurations. No claimed recall improvement from these8 positives. Evidence and screenshot: outputs/kb-chunk-fix-20261117/. Existing worker restarted after confirming all561 jobs SUCCEEDED and none pending, so future local reprocessing uses v5/v3.
