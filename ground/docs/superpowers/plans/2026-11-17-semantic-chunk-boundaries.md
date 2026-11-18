# Preserve sentences and short chapters when chunking

User-approved intent: targetTokens is a soft preference, maxTokens is the hard limit; avoid breaking sentences and chapters where possible, retain headings and exact source positions, local verification only.

- [x] Add failing cases for above-target intact sentences/paragraphs, whole Markdown QAs, sentence-aligned overlap, and oversized-sentence word/grapheme fallback.
- [x] Implement hierarchical boundaries with bounded token measurement; keep table row handling intact.
- [x] Verify actual supplied Word and Markdown with parameter sensitivity, exact source coverage, whole-question boundaries and hard limits.
- [x] Re-run core/retrieval/client protocol tests, isolated compile, independent review and local database recall. Do not publish.

Actual QA:600/900/80→8chunks,2000/2500/80→2chunks; all5 tested parameter combinations end at whole-question boundaries. Actual Word source retains every fitting chapter and exact canonical source ranges. Real local PostgreSQL+pgvector expert retrieval:8/8 at600-target/4000budget and8/8 at2000-target/8000budget. Core62 + retrieval/protocol19 + frontend knowledgeUI21 passed; independent500random checks passed.
