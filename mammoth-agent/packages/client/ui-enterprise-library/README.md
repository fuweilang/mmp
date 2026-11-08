# ui-enterprise-library

Web and desktop client entry for the single ground library via its connection-protected same-origin `/ground-library/*` Host transport. The Host forwards only allowlisted operations to Ground `/api/library/*`, never exposes its JWT and refuses account switches.
The left sidebar opens the library panel. The panel action "用于 AI 对话" and the composer `+` multi-select confirmation popup put a ready version on the current session draft, creating a session only when none is open. The `@` menu inserts the same kind of chip. Nothing sends until the user submits. Submit calls `/api/library/open` through the authenticated account Host and only the node and version ids. One stored chunk is sent as that chunk. A missing, refused, or empty excerpt does not send. `session/prompt` receives the expanded text and does not authorize the library again. Pasted text is not a controlled citation.

The native panel supports explicit multi-file save, folders, URL-only links, rename/move/download, version history/replacement, visibility, recycling, restore, purge and parse retry. Temporary local chat attachments are not uploaded by this package. Saving into the library stays an explicit library action, and new uploads remain private on the server.

## Model Experience

An `@` library chip serializes to one untrusted excerpt block containing the server-returned file name, version id, locator, and quote. The model sees that block only after the user sends the draft. The package adds no tool and does not call a local model provider.

## Known Limitations and Deferred Work

Desktop packaging is not exercised here. Web and desktop share the web-app composition. A signed-in Ground OIDC account and trusted Host connection are required; cross-origin direct browser calls are not used. OCR, spreadsheets, and ZIP contents stay download-only on the server.
