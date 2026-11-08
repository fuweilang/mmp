# ui-enterprise-library

Web and desktop client entry for the single ground library at `/api/library`.
The left sidebar opens the library panel. The panel action "用于 AI 对话" and the composer `+` command put a ready version on the current session draft, creating a session only when none is open. The `@` menu inserts the same kind of chip. Nothing sends until the user submits. Submit refetches that version and refuses one the server did not return.

Local files are not uploaded by this package. Saving into the library stays an explicit library action, and new uploads remain private on the server.

## Model Experience

An `@` library chip serializes to one untrusted excerpt block containing the server-returned file name, version id, locator, and quote. The model sees that block only after the user sends the draft. The package adds no tool and does not call a local model provider.

## Known Limitations and Deferred Work

Desktop packaging is not exercised here. The panel uses `MMP_GROUND_ORIGIN` when set, otherwise the page origin, which is the gateway origin for the hosted Web client. A direct desktop host without that origin cannot reach the library. OCR, spreadsheets, and ZIP contents stay download-only on the server.
