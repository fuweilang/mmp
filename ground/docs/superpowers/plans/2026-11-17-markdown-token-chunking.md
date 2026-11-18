# Markdown Token chunking correction

Goal: correct the user's reproduced FAQ where600/900/80 and2000/2500/80 both produced38 hard heading chunks. Keep local-only scope.

Use Markdown headings as soft, preferred boundaries while keeping original canonical text. Keep exact UTF-16 offsets and paragraph ranges. Store every covered heading path; mixed-heading chunks use their common ancestor as the primary locator. Retain individual paths for exact named-heading retrieval. Existing Word/PDF/table fences are unchanged. Increment parser/chunker identities.

- [x] Observe failing regression tests for titled FAQ parameter sensitivity and named-heading matching.
- [x] Implement Markdown-only soft heading boundaries and complete source/heading metadata.
- [x] Check actual supplied Markdown with both screenshot configs and overlap/max controls, plus existing Word regression.
- [x] Use isolated local PostgreSQL+pgvector API ingestion/reprocessing/expert preview for real recall tests.
- [x] Run core/retrieval/protocol checks, isolated compile, review and current-page verification; no publication.

Result: actual source38→9/3 chunks for600/2000 targets; original browser page verified. Real local PG+vector reprocessing and expert runtime:600 target at4000 budget8/8;2000 at4000 budget5/8;2000 at8000 budget8/8. The5/8 failure is retained and documented, not hidden by changing retrieval ranking. Full evidence under outputs/kb-markdown-fix-20261117/.
