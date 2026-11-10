# Library preview edge-to-edge follow-up

User explicitly requested removal of missing-font banner and outer paper chrome, with the document filling the right pane. This supersedes the library banner presentation described in earlier reports.

- Standalone byte previews no longer render the missing-font note. Conversion metadata and the separate tab Office font action remain intact.
- PDF reader opts into a library-only edge-to-edge presentation: zero padding, zero inter-page gap, white background, no surface shadow, full pane width in fit-width mode. Legacy tab PDF presentation retains its paper layout.
- REA reference: prior WorkBuddy retained analysis `ev_b8acb7013ded657cc888ef983c8e91efa881c001dfd2f4a96dfdae92698fbaad`; format-specific Office SDK/iframe paths were examined previously. This change matches the explicitly requested outer presentation and does not claim to use Tencent Office SDK.

Validation:
- Updated no-banner regression first failed against the previous implementation.
- Focused document-preview and library suite: 710 tests / 69 files passed.
- Built-Web browser acceptance: passed with real PDF, Word, PPT renderers; asserts zero padding/gap/shadow and exact full-width surface.
- Full build: 10 gates passed.
- Current logged-in local Chrome account: enterprise administrator / demo enterprise, shared Slogan大师.docx v1 4.6 KB, three PDF pages. Real DOM confirms notes=0, padding=0px, gap=0px, shadow=none, white background, surface=947px and viewport=947px.
- Screenshot: mammoth-agent/.superpowers/library-preview-runtime-20261109/slogan-edge-to-edge.jpg.

No production release, application replacement, commit or push performed.
